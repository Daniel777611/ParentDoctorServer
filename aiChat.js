/**
 * AI Chat Module - ChatGPT Integration
 * Handles conversations with parents and extracts child information
 */

require("dotenv").config();
const { Pool } = require("pg");

// OpenAI API (if available)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// In-memory conversation storage (family_id -> conversation history)
const conversations = new Map();

/**
 * Get or create conversation history for a family
 */
function getConversationHistory(familyId) {
  if (!conversations.has(familyId)) {
    conversations.set(familyId, []);
  }
  return conversations.get(familyId);
}

/**
 * Get existing child information from database
 */
async function getChildInfo(familyId) {
  try {
    const { rows } = await pool.query(
      `SELECT child_name, date_of_birth, gender, medical_record 
       FROM child 
       WHERE family_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [familyId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error("❌ Error fetching child info:", err.message);
    return null;
  }
}

/**
 * Get available doctors from database
 */
async function getAvailableDoctors() {
  try {
    const { rows } = await pool.query(
      `SELECT doctor_id, first_name, last_name, nation, major, avatar, verified
       FROM doctor 
       WHERE verified = TRUE AND ai_review_status = 'approved'
       ORDER BY created_at DESC
       LIMIT 10`
    );
    return rows;
  } catch (err) {
    console.error("❌ Error fetching doctors:", err.message);
    return [];
  }
}

/**
 * Parse age/birthday raw text and calculate accurate age (years, months, days)
 * Returns: { years: number, months: number, days: number, date_of_birth: string }
 */
function parseAgeAndCalculate(ageRawText, existingDateOfBirth) {
  if (!ageRawText && !existingDateOfBirth) {
    return null;
  }
  
  const result = {
    years: null,
    months: null,
    days: null,
    date_of_birth: null
  };
  
  try {
    // If we have a date of birth, calculate from it
    if (existingDateOfBirth) {
      result.date_of_birth = existingDateOfBirth;
      const ageCalc = calculateAgeFromDate(existingDateOfBirth);
      if (ageCalc) {
        result.years = ageCalc.years;
        result.months = ageCalc.months;
        result.days = ageCalc.days;
        return result;
      }
    }
    
    // Parse raw text
    const text = (ageRawText || '').toLowerCase().trim();
    
    // Try to extract date first (YYYY-MM-DD, MM/DD/YYYY, etc.)
    const dateMatch = text.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
    if (dateMatch) {
      let dateStr = dateMatch[1].replace(/\//g, '-');
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        let year, month, day;
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          year = parseInt(parts[0]);
          month = parseInt(parts[1]);
          day = parseInt(parts[2]);
        } else {
          // Try MM-DD-YYYY or DD-MM-YYYY
          const yearIdx = parts.findIndex(p => p.length === 4);
          if (yearIdx >= 0) {
            year = parseInt(parts[yearIdx]);
            month = parseInt(yearIdx === 0 ? parts[1] : parts[0]);
            day = parseInt(yearIdx === 2 ? parts[1] : parts[2]);
          }
        }
        
        if (year && month && day) {
          result.date_of_birth = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const ageCalc = calculateAgeFromDate(result.date_of_birth);
          if (ageCalc) {
            result.years = ageCalc.years;
            result.months = ageCalc.months;
            result.days = ageCalc.days;
            return result;
          }
        }
      }
    }
    
    // Try to extract age in months
    const monthMatch = text.match(/(\d+)\s*(?:个月|months?)/);
    if (monthMatch) {
      const totalMonths = parseInt(monthMatch[1]);
      result.years = Math.floor(totalMonths / 12);
      result.months = totalMonths % 12;
      result.days = 0;
      // Calculate approximate date of birth
      const today = new Date();
      const birthDate = new Date(today.getFullYear(), today.getMonth() - totalMonths, today.getDate());
      result.date_of_birth = `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`;
      return result;
    }
    
    // Try to extract age in days
    const dayMatch = text.match(/(\d+)\s*(?:天|days?)/);
    if (dayMatch) {
      const totalDays = parseInt(dayMatch[1]);
      result.years = 0;
      result.months = Math.floor(totalDays / 30);
      result.days = totalDays % 30;
      // Calculate date of birth
      const today = new Date();
      const birthDate = new Date(today.getTime() - totalDays * 24 * 60 * 60 * 1000);
      result.date_of_birth = `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`;
      return result;
    }
    
    // Try to extract age in years
    const yearMatch = text.match(/(\d+)\s*(?:岁|years?|years? old)/);
    if (yearMatch) {
      const years = parseInt(yearMatch[1]);
      result.years = years;
      result.months = 0;
      result.days = 0;
      // Calculate approximate date of birth (use current date minus years)
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - years, today.getMonth(), today.getDate());
      result.date_of_birth = `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`;
      return result;
    }
    
    // Try to extract just a number (assume years if between 0-25)
    const numMatch = text.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1]);
      if (num >= 0 && num <= 25) {
        result.years = num;
        result.months = 0;
        result.days = 0;
        const today = new Date();
        const birthDate = new Date(today.getFullYear() - num, today.getMonth(), today.getDate());
        result.date_of_birth = `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`;
        return result;
      }
    }
    
    return null;
  } catch (err) {
    console.error("❌ Error parsing age:", err.message);
    return null;
  }
}

/**
 * Calculate accurate age from date of birth (years, months, days)
 */
function calculateAgeFromDate(dateOfBirth) {
  if (!dateOfBirth) return null;
  
  try {
    let birthDate;
    if (dateOfBirth.includes('-')) {
      const parts = dateOfBirth.split('-');
      if (parts.length === 3) {
        birthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      } else {
        birthDate = new Date(dateOfBirth);
      }
    } else if (dateOfBirth.includes('/')) {
      const parts = dateOfBirth.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          birthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        } else {
          birthDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
        }
      }
    } else {
      birthDate = new Date(dateOfBirth);
    }
    
    if (isNaN(birthDate.getTime())) {
      return null;
    }
    
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    let days = today.getDate() - birthDate.getDate();
    
    // Adjust for negative days
    if (days < 0) {
      months--;
      const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      days += lastMonth.getDate();
    }
    
    // Adjust for negative months
    if (months < 0) {
      years--;
      months += 12;
    }
    
    // Age cannot be negative
    if (years < 0) {
      return { years: 0, months: 0, days: 0 };
    }
    
    return { years, months, days };
  } catch (err) {
    console.error("❌ Error calculating age from date:", err.message);
    return null;
  }
}

/**
 * Calculate age from date of birth (for backward compatibility)
 */
function calculateAge(dateOfBirth) {
  const result = calculateAgeFromDate(dateOfBirth);
  return result ? result.years : null;
}

/**
 * Build system prompt for AI assistant
 */
async function buildSystemPrompt(familyId) {
  let childInfo = null;
  let doctors = [];
  
  try {
    childInfo = await getChildInfo(familyId);
  } catch (err) {
    console.error("❌ Error fetching child info in buildSystemPrompt:", err.message);
    // Continue with null childInfo
  }
  
  try {
    doctors = await getAvailableDoctors();
  } catch (err) {
    console.error("❌ Error fetching doctors in buildSystemPrompt:", err.message);
    // Continue with empty doctors array
  }
  
  let prompt = `You are a friendly and caring pediatric health assistant for ParentDoctor, a platform where parents can instantly connect with pediatric doctors via video call - no appointments needed!

**YOUR ROLE:**
1. **Have natural conversations**: Talk like a caring friend who happens to know about children's health, not like a medical textbook
2. **Get to know the child**: Naturally ask about the child's name, age/birthday, and gender during conversation - but make it feel like you're just getting to know them, not filling out a form
3. **Give helpful advice**: Provide practical, easy-to-understand health advice based on what parents tell you
4. **Recommend doctors when needed**: When parents need professional help, let them know they can connect with a doctor right away via video call

**IMPORTANT - GATHER CHILD INFORMATION NATURALLY:**
You need to know these things about the child to give better advice:
- **Child's name** (e.g., "What's your child's name?" or "How should I call your little one?")
- **Age or birthday** (e.g., "How old is [name]?" or "When was [name] born?")
  - **CRITICAL**: When the parent tells you about age/birthday, acknowledge what they said, but then use the ACCURATE calculated age from the database in your responses.
  - Example: If parent says "he's 3 months old", you acknowledge "I see, [name] is 3 months old", but then use the accurate age from database (e.g., "For [name] who is 0岁3个月5天...")
  - Example: If parent says "born on 10-10-2025", you acknowledge "Got it, [name] was born on October 10, 2025", but then use the accurate calculated age from database.
  - **ALWAYS use the accurate age information provided in the "Current Child Information" section below when giving advice.**
- **Gender** (e.g., "Is [name] a boy or a girl?")

**HOW TO ASK FOR INFORMATION:**
- Don't ask all questions at once - spread them out naturally in conversation
- If the parent mentions something naturally (like "my 5-year-old son"), acknowledge it EXACTLY as they said it
- Make it feel like friendly conversation, not an interview
- Example: "I'd love to help! What's your child's name? And how old are they?" - then later: "Is [name] a boy or a girl? This helps me give more specific advice."

**RESPONSE STYLE:**
- Be warm, friendly, and conversational - like talking to a friend
- Use simple language, avoid medical jargon unless necessary
- Show empathy and understanding
- When you know the child's name, use it naturally in your responses
- When you know their age, mention it when relevant (e.g., "For a 5-year-old like [name]...")
- Keep responses helpful but not overwhelming
- If you don't have the child's information yet, naturally ask for it during the conversation

**Available Doctors in Database:**\n`;
  
  if (doctors.length > 0) {
    doctors.forEach((doc, index) => {
      const fullName = `${doc.first_name} ${doc.last_name}`;
      const specialty = doc.major || 'Pediatrics';
      const location = doc.nation || 'Location not specified';
      prompt += `${index + 1}. Dr. ${fullName} - ${specialty} (${location}) - AVAILABLE FOR INSTANT VIDEO CONSULTATION\n`;
    });
    prompt += `\n**IMPORTANT**: These doctors are available RIGHT NOW for immediate video consultation. No appointment needed! When recommending, emphasize: "You can connect with Dr. [Name] right now via video call - no appointment needed!"`;
  } else {
    prompt += `\nNo doctors available in database yet.`;
  }
  
  prompt += `\n\n**Current Child Information in Database (USE THIS IN EVERY RESPONSE):**\n`;
  
  if (childInfo) {
    // Calculate accurate age (years, months, days) from date of birth
    let accurateAge = null;
    if (childInfo.date_of_birth) {
      accurateAge = calculateAgeFromDate(childInfo.date_of_birth);
    }
    
    // Also try to extract age from medical_record if available (format: "年龄: X岁Y个月Z天")
    let ageFromRecord = null;
    if (childInfo.medical_record) {
      const ageMatch = childInfo.medical_record.match(/年龄[：:]\s*(\d+)岁(\d+)个月(\d+)天/);
      if (ageMatch) {
        ageFromRecord = {
          years: parseInt(ageMatch[1]),
          months: parseInt(ageMatch[2]),
          days: parseInt(ageMatch[3])
        };
      }
    }
    
    // Use age from medical_record if available, otherwise use calculated age
    const finalAge = ageFromRecord || accurateAge;
    
    const childName = childInfo.child_name || null;
    const gender = childInfo.gender || null;
    
    if (childName) {
      prompt += `- **Child's Name: ${childName}** - ALWAYS use this name in your responses to personalize them\n`;
    } else {
      prompt += `- Name: Not provided yet\n`;
    }
    
    if (finalAge) {
      const ageText = `${finalAge.years}岁${finalAge.months}个月${finalAge.days}天`;
      const ageTextEnglish = finalAge.years > 0 
        ? `${finalAge.years} year${finalAge.years > 1 ? 's' : ''}${finalAge.months > 0 ? `, ${finalAge.months} month${finalAge.months > 1 ? 's' : ''}` : ''}${finalAge.days > 0 ? `, ${finalAge.days} day${finalAge.days > 1 ? 's' : ''}` : ''} old`
        : finalAge.months > 0
        ? `${finalAge.months} month${finalAge.months > 1 ? 's' : ''}${finalAge.days > 0 ? `, ${finalAge.days} day${finalAge.days > 1 ? 's' : ''}` : ''} old`
        : `${finalAge.days} day${finalAge.days > 1 ? 's' : ''} old`;
      
      prompt += `- **Age: ${ageText}** (${ageTextEnglish}) - Born: ${childInfo.date_of_birth || 'date calculated from age'}\n`;
      prompt += `  **IMPORTANT**: Use this EXACT age information (${ageText}) when giving advice. For example: "For ${childName} who is ${ageText}, I recommend..." or "Since ${childName} is ${ageText}, this is important because..."\n`;
    } else if (childInfo.date_of_birth) {
      prompt += `- **Date of Birth: ${childInfo.date_of_birth}** - Age calculation pending\n`;
    } else {
      prompt += `- Age: Not provided yet\n`;
    }
    
    if (gender) {
      prompt += `- **Gender: ${gender}** - Use this for personalized guidance\n`;
    } else {
      prompt += `- Gender: Not provided yet\n`;
    }
    
    if (childInfo.medical_record) {
      prompt += `- Previous Medical Notes: ${childInfo.medical_record}\n`;
    }
    
    // Add personalized response examples with accurate age
    if (childName && finalAge) {
      const ageText = `${finalAge.years}岁${finalAge.months}个月${finalAge.days}天`;
      prompt += `\n**EXAMPLE PERSONALIZED RESPONSES (use the exact age ${ageText}):**
- "For ${childName} who is ${ageText}, I recommend..."
- "Since ${childName} is ${ageText}, this is important because..."
- "Given that ${childName} is ${ageText}, here's what you should know..."
- "For a ${finalAge.years > 0 ? `${finalAge.years}-year-old` : finalAge.months > 0 ? `${finalAge.months}-month-old` : `${finalAge.days}-day-old`} like ${childName}..."`;
    }
  } else {
    prompt += `No child information in database yet. Gather this information naturally during conversation, then ALWAYS use it in subsequent responses.`;
  }
  
  prompt += `\n\n**CURRENT SITUATION:**
${childInfo && (childInfo.child_name || childInfo.date_of_birth || childInfo.gender) 
  ? `You already know some information about the child. Use it naturally in your responses.` 
  : `You don't have the child's information yet. Naturally ask for their name, age, and gender during the conversation - but make it feel like friendly conversation, not an interview.`}

**REMEMBER:**
- Talk naturally, like a caring friend
- Ask for child information (name, age, gender) naturally during conversation
- Use the child's name when you know it
- Keep advice practical and easy to understand
- If parents need a doctor, remind them they can connect instantly via video call`;
  
  return prompt;
}

/**
 * Call OpenAI API (or fallback to rule-based response)
 */
async function callAI(messages, familyId) {
  // If OpenAI API key is not configured, use rule-based fallback
  if (!OPENAI_API_KEY) {
    console.log("⚠️  OpenAI API key not configured, using rule-based responses");
    return generateRuleBasedResponse(messages, familyId);
  }

  try {
    // Use Node.js built-in fetch (available in Node 18+) or use https module
    const https = require('https');
    const { URL } = require('url');
    
    return new Promise((resolve, reject) => {
      const urlObj = new URL(OPENAI_API_URL);
      const postData = JSON.stringify({
        model: "gpt-4o-mini", // or "gpt-3.5-turbo" for cheaper option
        messages: messages,
        temperature: 0.7,
        max_tokens: 800 // Increased for more detailed, professional responses
      });
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              resolve(data.choices[0].message.content);
            } catch (parseErr) {
              console.error("❌ Error parsing OpenAI response:", parseErr.message);
              resolve(generateRuleBasedResponse(messages, familyId));
            }
          } else {
            console.error("❌ OpenAI API error:", res.statusCode, body);
            resolve(generateRuleBasedResponse(messages, familyId));
          }
        });
      });
      
      req.on('error', (err) => {
        console.error("❌ Error calling OpenAI API:", err.message);
        resolve(generateRuleBasedResponse(messages, familyId));
      });
      
      req.write(postData);
      req.end();
    });
  } catch (err) {
    console.error("❌ Error calling OpenAI API:", err.message);
    return generateRuleBasedResponse(messages, familyId);
  }
}

/**
 * Rule-based fallback response generator
 */
async function generateRuleBasedResponse(messages, familyId) {
  const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";
  const childInfo = await getChildInfo(familyId);
  const doctors = await getAvailableDoctors();
  
  // Build doctor recommendation text
  let doctorRecommendation = "";
  if (doctors.length > 0) {
    const doctorList = doctors.slice(0, 3).map(doc => {
      const fullName = `${doc.first_name} ${doc.last_name}`;
      const specialty = doc.major || 'Pediatrics';
      return `Dr. ${fullName} (${specialty})`;
    }).join(", ");
    doctorRecommendation = `\n\n👨‍⚕️ **Available Doctors:**\nI can connect you with ${doctorList}. Would you like me to recommend one of them?`;
  }
  
  // Check if we need to ask for child information (ask naturally, like a friend)
  if (!childInfo || !childInfo.child_name) {
    return `Hi! I'm here to help with your child's health. I'd love to get to know your little one better - what's their name? And how old are they?`;
  }
  
  if (!childInfo.date_of_birth) {
    return `Thanks for telling me about ${childInfo.child_name}! How old is ${childInfo.child_name}? Or when were they born?`;
  }
  
  if (!childInfo.gender) {
    const age = childInfo.date_of_birth ? calculateAge(childInfo.date_of_birth) : null;
    const ageText = age ? ` who is ${age} years old` : "";
    return `Got it! So ${childInfo.child_name}${ageText}. Is ${childInfo.child_name} a boy or a girl? This helps me give you more specific advice.`;
  }
  
  // We have all basic info, provide personalized advice
  const age = childInfo.date_of_birth ? calculateAge(childInfo.date_of_birth) : null;
  const ageText = age ? ` (${age} years old)` : "";
  const childName = childInfo.child_name;
  
  // Get child details for personalized responses
  const gender = childInfo.gender || 'child';
  const genderText = gender === 'male' ? 'boy' : gender === 'female' ? 'girl' : 'child';
  
  // Provide natural, friendly health advice
  if (lastUserMessage.includes("fever") || lastUserMessage.includes("发烧")) {
    return `I understand you're worried about ${childName}'s fever${ageText ? ` - ${childName} is ${age} years old, right?` : ''}. Here are some things that might help:

• **Keep an eye on the temperature** - Check it every few hours to see if it's going up or down
• **Make sure ${childName} drinks plenty of water** - This is really important when they have a fever
• **Let ${childName} rest** - Their body needs energy to fight off whatever's making them sick
• **You can use fever medicine** if needed - but check with a doctor first about the right amount for ${age !== null ? `a ${age}-year-old` : 'their age'}

**When you should definitely see a doctor:**
• The fever lasts more than 3 days
• The temperature gets really high (above 104°F/40°C)
• ${childName} seems very tired or hard to wake up
• ${childName} isn't drinking much or seems dehydrated

${doctors.length > 0 ? `If you're worried, you can connect with one of our pediatricians right now via video call - no need to make an appointment! Would that help?` : ''}`;
  }
  
  if (lastUserMessage.includes("cough") || lastUserMessage.includes("咳嗽")) {
    return `I hear ${childName} has a cough${ageText ? ` - and ${childName} is ${age} years old` : ''}. Here are some things that usually help:

• **Keep ${childName} hydrated** - Drinking water helps thin out the mucus and makes the cough less annoying
• **Try a humidifier** - Adding some moisture to the air can help, especially at night
• **Make sure ${childName} gets enough rest** - Their body needs time to recover
• **Keep the air clean** - Try to avoid smoke, strong smells, or things that might irritate their throat

**You should see a doctor if:**
• The cough doesn't go away after a week
• ${childName} seems to be having trouble breathing
• The cough comes with a high fever
• ${childName} looks really uncomfortable or their lips look bluish

${doctors.length > 0 ? `If you want, you can talk to one of our pediatricians right away via video call - no appointment needed!` : ''}`;
  }
  
  if (lastUserMessage.includes("doctor") || lastUserMessage.includes("医生") || 
      lastUserMessage.includes("recommend") || lastUserMessage.includes("推荐") ||
      lastUserMessage.includes("connect") || lastUserMessage.includes("连线")) {
    if (doctors.length > 0) {
      const doctorList = doctors.slice(0, 3).map((doc, idx) => {
        const fullName = `${doc.first_name} ${doc.last_name}`;
        const specialty = doc.major || 'Pediatrics';
        const location = doc.nation || '';
        return `${idx + 1}. **Dr. ${fullName}** - ${specialty}${location ? ` (${location})` : ''}`;
      }).join("\n");
      return `I'd be happy to help you connect with a doctor for ${childName}${ageText ? ` (${age} years old)` : ''}! Here are excellent pediatricians available RIGHT NOW on ParentDoctor:

${doctorList}

**🎯 Key Feature: Instant Connection - No Appointment Needed!**
You can connect with any of these doctors immediately via video call. This is perfect for ${childName}'s situation - you don't need to wait for an appointment. Would you like me to help you choose the best doctor based on ${childName}'s specific needs?`;
    } else {
      return `I understand you're looking to connect with a doctor for ${childName}${ageText ? ` (${age} years old)` : ''}. Currently, we're building our network of pediatricians. In the meantime, I'm here to provide evidence-based health advice tailored to ${childName}. What specific concerns do you have?`;
    }
  }
  
  // Default natural, friendly response
  return `I understand you're concerned about ${childName}${ageText ? ` (${age} years old)` : ''}. Can you tell me more about what's going on? What symptoms is ${childName} showing?${doctorRecommendation}`;
}

/**
 * Extract child information from conversation (supports both English and Chinese)
 * For age/birthday: Extract raw text and let backend calculate accurately
 */
function extractChildInfo(messages) {
  const info = {
    child_name: null,
    date_of_birth: null,
    age_raw_text: null, // Store raw age/birthday text from user
    gender: null,
    medical_record: null
  };
  
  // Combine all messages (keep original case for name extraction)
  const fullText = messages.map(m => m.content).join(" ");
  const lowerText = fullText.toLowerCase();
  
  console.log(`🔍 Extracting child info from conversation (${messages.length} messages)`);
  console.log(`📝 Full text: ${fullText.substring(0, 200)}...`);
  
  // Extract name (supports English and Chinese, more patterns)
  const namePatterns = [
    // English patterns - more comprehensive
    /(?:my child|child|kid|baby|son|daughter) (?:is|named|called|name is) ([a-z\u4e00-\u9fa5\s'-]+)/i,
    /(?:name is|named|called) ([a-z\u4e00-\u9fa5\s'-]+)/i,
    /(?:his|her) name (?:is|is called) ([a-z\u4e00-\u9fa5\s'-]+)/i,
    // Chinese patterns
    /(?:他|她|孩子|宝宝|儿子|女儿) (?:叫|名字是|名字叫|姓名是) ([a-z\u4e00-\u9fa5\s'-]+)/i,
    /(?:叫|名字是|名字叫|姓名是) ([a-z\u4e00-\u9fa5\s'-]+)/i,
    // Direct mention: "X is my child" or "我的孩子是X"
    /^([a-z\u4e00-\u9fa5\s'-]+) (?:is|是) (?:my|我的) (?:child|kid|baby|son|daughter|孩子|宝宝|儿子|女儿)/i,
    /(?:my|我的) (?:child|kid|baby|son|daughter|孩子|宝宝|儿子|女儿) (?:is|是) ([a-z\u4e00-\u9fa5\s'-]+)/i,
    // More flexible patterns - catch names mentioned in context
    /(?:孩子|宝宝|儿子|女儿) ([a-z\u4e00-\u9fa5]{1,20})/i,
    /([a-z\u4e00-\u9fa5]{1,20}) (?:岁|years? old|个月|months?)/i,
    // Catch names when AI mentions them: "Elijiah真是个可爱的名字"
    /([A-Z][a-z]+) (?:真是个|是|的|真)/i,
    // Catch names in quotes or after "叫"
    /(?:叫|名字是|name is) ([A-Z][a-z]+)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      // Remove common words that might be captured
      name = name.replace(/\b(and|or|the|a|an|is|are|was|were|的|和|或|真|是|个|可爱)\b/gi, '').trim();
      
      // Remove trailing punctuation and common suffixes
      name = name.replace(/[，,。.！!？?]$/, '').trim();
      
      if (name.length >= 1 && name.length <= 30 && !/^\d+$/.test(name) && !/^[，,。.！!？?]+$/.test(name)) {
        // Capitalize first letter for English names, keep Chinese as is
        if (/^[a-z]/.test(name)) {
          info.child_name = name.charAt(0).toUpperCase() + name.slice(1);
        } else if (/^[A-Z]/.test(name)) {
          // Already capitalized, use as is
          info.child_name = name;
        } else {
          // Chinese or other, use as is
          info.child_name = name;
        }
        console.log(`👶 Extracted child name: ${info.child_name} (from pattern: ${pattern})`);
        break;
      }
    }
  }
  
  // Extract age/birthday information - store raw text for backend to parse accurately
  const agePatterns = [
    // Date formats - extract as-is
    /(?:born|birthday|date of birth|dob|出生|生日|出生日期) (?:on|is|是|在)?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    /(?:出生于|生日是|出生在)\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
    // Age patterns - extract full context (capture more text for accurate parsing)
    /(?:age|年龄) (?:is|of|是)?\s*([^，,。.！!？?\n]+)/i,
    /(?:今年|现在|已经) ([^，,。.！!？?\n]*\d+[^，,。.！!？?\n]*(?:岁|years?|months?|days?|个月|天))/i,
    /(\d+[^，,。.！!？?\n]*(?:years?|months?|days?|岁|个月|天|old|age))/i,
    /(?:孩子|宝宝|儿子|女儿) ([^，,。.！!？?\n]*\d+[^，,。.！!？?\n]*(?:岁|years?|months?|days?|个月|天))/i,
    /(\d+岁)/i,
    /(\d+ years? old)/i,
    /(\d+ months?)/i,
    /(\d+ days?)/i,
    /(\d+个月)/i,
    /(\d+天)/i
  ];
  
  for (const pattern of agePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const rawText = match[1].trim();
      // Store raw text - backend will parse it accurately
      info.age_raw_text = rawText;
      console.log(`📅 Extracted age/birthday raw text: "${rawText}"`);
      
      // Also try to extract date if it's a clear date format
      if (rawText.includes('-') || rawText.includes('/')) {
        let normalizedDate = rawText.replace(/\//g, '-');
        const parts = normalizedDate.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const day = parseInt(parts[2]);
          if (year >= 1900 && year <= new Date().getFullYear() && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            info.date_of_birth = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            console.log(`📅 Also extracted date of birth: ${info.date_of_birth}`);
          }
        }
      }
      break;
    }
  }
  
  // Extract gender (supports English and Chinese)
  if (lowerText.includes("boy") || lowerText.includes("son") || lowerText.includes("male") || 
      lowerText.includes("男孩") || lowerText.includes("儿子") || lowerText.includes("男") ||
      lowerText.includes("是个男孩") || lowerText.includes("是男孩")) {
    info.gender = "male";
    console.log(`👦 Extracted gender: male`);
  } else if (lowerText.includes("girl") || lowerText.includes("daughter") || lowerText.includes("female") ||
             lowerText.includes("女孩") || lowerText.includes("女儿") || lowerText.includes("女") ||
             lowerText.includes("是个女孩") || lowerText.includes("是女孩")) {
    info.gender = "female";
    console.log(`👧 Extracted gender: female`);
  }
  
  // Log what was extracted
  const extracted = [];
  if (info.child_name) extracted.push(`name: ${info.child_name}`);
  if (info.date_of_birth) extracted.push(`date_of_birth: ${info.date_of_birth}`);
  if (info.gender) extracted.push(`gender: ${info.gender}`);
  if (info.medical_record) extracted.push(`medical_record: ${info.medical_record}`);
  
  if (extracted.length > 0) {
    console.log(`✅ Extracted child info: ${extracted.join(', ')}`);
  } else {
    console.log(`⚠️  No child info extracted from conversation`);
  }
  
  return info;
}

/**
 * Save or update child information in database
 */
async function saveChildInfo(familyId, childInfo) {
  try {
    // Validate familyId
    if (!familyId) {
      console.error("❌ Cannot save child info: familyId is required");
      return;
    }
    
    // Combine age_info into medical_record if available
    let medicalRecord = childInfo.medical_record || null;
    if (childInfo.age_info && !medicalRecord) {
      medicalRecord = `年龄: ${childInfo.age_info}`;
    } else if (childInfo.age_info && medicalRecord) {
      medicalRecord = `${medicalRecord}; 年龄: ${childInfo.age_info}`;
    }
    
    // Log what we're trying to save
    console.log(`💾 Attempting to save child info for family ${familyId}:`, {
      child_name: childInfo.child_name || 'null',
      date_of_birth: childInfo.date_of_birth || 'null',
      gender: childInfo.gender || 'null',
      medical_record: medicalRecord || 'null',
      age_info: childInfo.age_info || 'null'
    });
    
    // Check if child already exists for this family
    // We check by family_id only, since we want to update the same child record
    const { rows: existing } = await pool.query(
      `SELECT id FROM child 
       WHERE family_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [familyId]
    );
    
    if (existing.length > 0) {
      // Update existing - update even if only one field has a value
      const updateResult = await pool.query(
        `UPDATE child 
         SET child_name = COALESCE($1, child_name),
             date_of_birth = COALESCE($2, date_of_birth),
             gender = COALESCE($3, gender),
             medical_record = COALESCE($4, medical_record),
             updated_at = NOW()
         WHERE id = $5`,
        [
          childInfo.child_name,
          childInfo.date_of_birth,
          childInfo.gender,
          medicalRecord,
          existing[0].id
        ]
      );
      console.log(`✅ Updated child info for family ${familyId} (ID: ${existing[0].id}), rows affected: ${updateResult.rowCount}`);
    } else {
      // Insert new - insert even if only one field has a value
      if (childInfo.child_name || childInfo.date_of_birth || childInfo.gender || childInfo.medical_record) {
        const insertResult = await pool.query(
          `INSERT INTO child (family_id, child_name, date_of_birth, gender, medical_record, extracted_from_chat)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING id`,
          [
            familyId,
            childInfo.child_name,
            childInfo.date_of_birth,
            childInfo.gender,
            medicalRecord
          ]
        );
        console.log(`✅ Created new child record for family ${familyId} (ID: ${insertResult.rows[0].id})`);
      } else {
        console.log(`⚠️  Skipping save: no child information to save for family ${familyId}`);
      }
    }
  } catch (err) {
    console.error("❌ Error saving child info:", err.message);
    console.error("❌ Error stack:", err.stack);
    // Don't throw - allow the chat to continue even if save fails
    // But log the error so we can debug
  }
}

/**
 * Main function to handle AI chat message
 */
async function handleChatMessage(familyId, userMessage) {
  try {
    // Validate inputs
    if (!familyId) {
      throw new Error("Family ID is required");
    }
    if (!userMessage || !userMessage.trim()) {
      throw new Error("Message is required");
    }
    
    // Get conversation history
    const history = getConversationHistory(familyId);
    
    // Add user message to history
    history.push({
      role: "user",
      content: userMessage.trim()
    });
    
    // Build system prompt (with error handling)
    let systemPrompt;
    try {
      systemPrompt = await buildSystemPrompt(familyId);
    } catch (err) {
      console.error("❌ Error building system prompt:", err.message);
      // Use a basic fallback prompt
      systemPrompt = `You are a helpful pediatric health assistant for ParentDoctor. Provide professional, evidence-based health advice to parents.`;
    }
    
    // Prepare messages for AI
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10) // Keep last 10 messages for context
    ];
    
    // Get AI response (with error handling)
    let aiResponse;
    try {
      aiResponse = await callAI(messages, familyId);
      if (!aiResponse || !aiResponse.trim()) {
        aiResponse = "I apologize, but I'm having trouble processing your message. Could you please rephrase your question?";
      }
    } catch (err) {
      console.error("❌ Error calling AI:", err.message);
      aiResponse = "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.";
    }
    
    // Add AI response to history
    history.push({
      role: "assistant",
      content: aiResponse
    });
    
    // Extract child information from conversation (with error handling)
    let extractedInfo = { child_name: null, date_of_birth: null, gender: null, medical_record: null };
    try {
      extractedInfo = extractChildInfo(history);
    } catch (err) {
      console.error("❌ Error extracting child info:", err.message);
      // Continue with empty extractedInfo
    }
    
    // Get current child info from database (with error handling)
    let childInfo = null;
    try {
      childInfo = await getChildInfo(familyId);
    } catch (err) {
      console.error("❌ Error fetching child info:", err.message);
      // Continue with null childInfo
    }
    
    // Parse age/birthday information accurately
    let parsedAge = null;
    if (extractedInfo.age_raw_text || extractedInfo.date_of_birth) {
      parsedAge = parseAgeAndCalculate(extractedInfo.age_raw_text, extractedInfo.date_of_birth || childInfo?.date_of_birth);
      if (parsedAge) {
        console.log(`📊 Parsed age: ${parsedAge.years} years, ${parsedAge.months} months, ${parsedAge.days} days`);
        if (parsedAge.date_of_birth) {
          extractedInfo.date_of_birth = parsedAge.date_of_birth;
        }
      }
    }
    
    // Check if we extracted ANY new information (even just one field)
    const hasAnyNewInfo = extractedInfo.child_name || 
                         extractedInfo.date_of_birth || 
                         extractedInfo.age_raw_text ||
                         extractedInfo.gender || 
                         extractedInfo.medical_record;
    
    console.log(`🔍 Checking extracted info:`, {
      child_name: extractedInfo.child_name,
      date_of_birth: extractedInfo.date_of_birth,
      age_raw_text: extractedInfo.age_raw_text,
      parsed_age: parsedAge,
      gender: extractedInfo.gender,
      medical_record: extractedInfo.medical_record,
      hasAnyNewInfo
    });
    
    // Log what was extracted (info was already saved before building prompt)
    if (hasAnyNewInfo) {
      const extractedFields = [];
      if (extractedInfo.child_name) extractedFields.push(`name: ${extractedInfo.child_name}`);
      if (extractedInfo.date_of_birth) extractedFields.push(`date_of_birth: ${extractedInfo.date_of_birth}`);
      if (extractedInfo.age_raw_text) extractedFields.push(`age_raw_text: "${extractedInfo.age_raw_text}"`);
      if (parsedAge) extractedFields.push(`parsed_age: ${parsedAge.years}岁${parsedAge.months}个月${parsedAge.days}天`);
      if (extractedInfo.gender) extractedFields.push(`gender: ${extractedInfo.gender}`);
      if (extractedInfo.medical_record) extractedFields.push(`medical_record: ${extractedInfo.medical_record}`);
      
      console.log(`✅ Child info extracted and saved for family ${familyId}. Extracted: ${extractedFields.join(', ')}`);
    }
    
    return {
      response: aiResponse,
      extractedInfo: hasAnyNewInfo ? extractedInfo : null
    };
  } catch (err) {
    console.error("❌ Error handling chat message:", err.message);
    console.error("❌ Error stack:", err.stack);
    throw err;
  }
}

/**
 * Clear conversation history for a family
 */
function clearConversation(familyId) {
  conversations.delete(familyId);
}

module.exports = {
  handleChatMessage,
  clearConversation,
  getChildInfo
};

