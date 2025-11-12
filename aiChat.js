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
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  
  try {
    // Try to parse different date formats
    let birthDate;
    if (dateOfBirth.includes('-')) {
      birthDate = new Date(dateOfBirth);
    } else if (dateOfBirth.includes('/')) {
      const parts = dateOfBirth.split('/');
      if (parts.length === 3) {
        // Assume MM/DD/YYYY or DD/MM/YYYY
        birthDate = new Date(parts[2], parts[0] - 1, parts[1]);
      }
    } else {
      birthDate = new Date(dateOfBirth);
    }
    
    if (isNaN(birthDate.getTime())) {
      return null;
    }
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  } catch (err) {
    console.error("❌ Error calculating age:", err.message);
    return null;
  }
}

/**
 * Build system prompt for AI assistant
 */
async function buildSystemPrompt(familyId) {
  const childInfo = await getChildInfo(familyId);
  const doctors = await getAvailableDoctors();
  
  let prompt = `You are a professional pediatric health assistant for ParentDoctor, a revolutionary platform that connects parents with pediatric doctors INSTANTLY - no appointments needed, immediate video consultations available.

**YOUR ROLE:**
1. **Provide evidence-based health advice**: Give professional, research-backed health guidance based on pediatric medical literature and best practices
2. **Personalize every response**: ALWAYS use the child's specific information (name, age, gender) in your responses to make parents feel their information is valuable and being used
3. **Recommend instant doctor connections**: When appropriate, recommend doctors from our database who are available for IMMEDIATE video consultation (no appointment needed)
4. **Reference medical research**: When providing advice, you can reference pediatric medical guidelines, research findings, and evidence-based practices
5. **Make parents feel special**: Show that you remember and use their child's information, making them feel they're receiving personalized, unique care

**CRITICAL PRODUCT FEATURES:**
- **NO APPOINTMENTS NEEDED**: Parents can connect with doctors instantly via video call
- **IMMEDIATE CONSULTATION**: Doctors are available for real-time video consultations right now
- **PERSONALIZED SERVICE**: Every interaction is tailored to the specific child's information

**IMPORTANT GUIDELINES:**
- **ALWAYS use the child's name** when you have it - this makes responses feel personal and unique
- **Reference the child's age** when giving advice - age-specific guidance shows expertise
- **Acknowledge the child's information** - "Based on ${childName}'s age of ${age} years..." or "For a ${age}-year-old ${gender} like ${childName}..."
- **Be professional and evidence-based** - reference pediatric guidelines, research, or medical best practices when appropriate
- **Emphasize instant connection** - "You can connect with Dr. [Name] right now via video call - no appointment needed!"
- **Ask questions naturally** - "To give you the best personalized advice for ${childName}, could you tell me a bit more about..."
- **Make parents feel valued** - Show that their child's information is being actively used to provide unique, tailored advice

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
    const age = childInfo.date_of_birth ? calculateAge(childInfo.date_of_birth) : null;
    const childName = childInfo.child_name || null;
    const gender = childInfo.gender || null;
    
    if (childName) {
      prompt += `- **Child's Name: ${childName}** - ALWAYS use this name in your responses to personalize them\n`;
    } else {
      prompt += `- Name: Not provided yet\n`;
    }
    
    if (childInfo.date_of_birth && age !== null) {
      prompt += `- **Age: ${age} years old** (Born: ${childInfo.date_of_birth}) - ALWAYS reference this age when giving advice\n`;
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
    
    // Add personalized response examples
    if (childName && age !== null) {
      prompt += `\n**EXAMPLE PERSONALIZED RESPONSES:**
- "Based on ${childName}'s age of ${age} years, research shows that..."
- "For a ${age}-year-old ${gender || 'child'} like ${childName}, the American Academy of Pediatrics recommends..."
- "Given that ${childName} is ${age} years old, here's what pediatric guidelines suggest..."
- "Since ${childName} is ${age} years old, this is particularly important because..."`;
    }
  } else {
    prompt += `No child information in database yet. Gather this information naturally during conversation, then ALWAYS use it in subsequent responses.`;
  }
  
  prompt += `\n\n**Response Style:**
- **ALWAYS use the child's name** if available - this makes responses feel unique and personal
- **Reference the child's age** in every response when giving advice - show you're using their information
- **Be professional and evidence-based** - reference pediatric guidelines (AAP, WHO), research findings, or medical best practices
- **Emphasize instant connection** - "You can connect with Dr. [Name] RIGHT NOW via video call - no appointment needed!"
- **Show expertise** - reference age-appropriate medical guidelines and research
- **Make parents feel valued** - demonstrate that their child's information is actively being used
- Be empathetic, warm, and professional
- Keep responses informative but concise`;
  
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
  
  // Check if we need to ask for child information (ask naturally, not like a form)
  if (!childInfo || !childInfo.child_name) {
    return `Hello! I'm here to help you with your child's health. To give you the best advice, could you tell me a bit about your child? What's their name and how old are they?`;
  }
  
  if (!childInfo.date_of_birth) {
    const nameText = childInfo.child_name ? `, ${childInfo.child_name}` : "";
    return `Thank you${nameText}! To provide personalized advice, could you tell me your child's age or date of birth?`;
  }
  
  if (!childInfo.gender) {
    const age = childInfo.date_of_birth ? calculateAge(childInfo.date_of_birth) : null;
    const ageText = age ? ` (${age} years old)` : "";
    return `I see ${childInfo.child_name}${ageText}. Could you tell me if they're a boy or a girl? This helps me give more specific advice.`;
  }
  
  // We have all basic info, provide personalized advice
  const age = childInfo.date_of_birth ? calculateAge(childInfo.date_of_birth) : null;
  const ageText = age ? ` (${age} years old)` : "";
  const childName = childInfo.child_name;
  
  // Get child details for personalized responses
  const gender = childInfo.gender || 'child';
  const genderText = gender === 'male' ? 'boy' : gender === 'female' ? 'girl' : 'child';
  
  // Provide evidence-based, personalized health advice
  if (lastUserMessage.includes("fever") || lastUserMessage.includes("发烧")) {
    const ageSpecificAdvice = age !== null && age < 3 
      ? `For ${childName}, who is ${age} years old, the American Academy of Pediatrics recommends monitoring fever closely in young children.`
      : age !== null && age >= 3
      ? `Based on ${childName}'s age of ${age} years, pediatric guidelines suggest the following approach.`
      : '';
    
    return `${ageSpecificAdvice ? ageSpecificAdvice + ' ' : ''}I understand you're concerned about ${childName}'s fever${ageText ? ` (${age} years old)` : ''}. Here's evidence-based guidance:

🩺 **Evidence-Based Recommendations:**
• **Temperature monitoring**: According to pediatric guidelines, monitor ${childName}'s temperature every 4-6 hours
• **Hydration**: Research shows adequate hydration is crucial - offer water or age-appropriate electrolyte solutions
• **Rest**: Ensure ${childName} gets plenty of rest to support immune function
• **Fever management**: For a ${age !== null ? `${age}-year-old` : 'child'} like ${childName}, age-appropriate fever reducers may be considered (consult a doctor for exact dosage)

⚠️ **When to Seek Immediate Medical Attention (AAP Guidelines):**
• Fever persists for more than 3 days
• Temperature exceeds 104°F/40°C
• ${childName} shows signs of dehydration (dry mouth, no tears, reduced urination)
• ${childName} appears very unwell, lethargic, or difficult to rouse

${doctors.length > 0 ? `\n👨‍⚕️ **Instant Doctor Connection:**\nYou can connect with one of our pediatricians RIGHT NOW via video call - no appointment needed! This is especially important for a ${age !== null ? `${age}-year-old` : 'young child'} like ${childName}. Would you like me to connect you?` : ''}`;
  }
  
  if (lastUserMessage.includes("cough") || lastUserMessage.includes("咳嗽")) {
    const ageSpecificAdvice = age !== null && age < 2
      ? `For ${childName}, who is ${age} years old, cough management requires special attention in infants and toddlers.`
      : age !== null && age >= 2
      ? `Based on ${childName}'s age of ${age} years, here's what pediatric research recommends.`
      : '';
    
    return `${ageSpecificAdvice ? ageSpecificAdvice + ' ' : ''}I understand ${childName} has a cough${ageText ? ` (${age} years old)` : ''}. Here's personalized, evidence-based guidance:

🩺 **Evidence-Based Recommendations for ${childName}:**
• **Hydration**: Keep ${childName} well-hydrated - research shows this helps thin mucus and soothe the throat
• **Humidifier**: Using a cool-mist humidifier in ${childName}'s room can help, especially for a ${age !== null ? `${age}-year-old` : 'young child'}
• **Rest**: Ensure ${childName} gets adequate rest to support recovery
• **Environment**: Avoid irritants like smoke, strong perfumes, or allergens around ${childName}

⚠️ **When to Seek Immediate Medical Attention:**
• Cough persists for more than a week
• ${childName} has difficulty breathing or shows signs of respiratory distress
• Cough is accompanied by high fever (especially concerning for a ${age !== null ? `${age}-year-old` : 'young child'})
• ${childName} appears distressed, has bluish lips, or shows signs of oxygen deprivation

${doctors.length > 0 ? `\n👨‍⚕️ **Instant Doctor Connection:**\nFor a ${age !== null ? `${age}-year-old` : 'young child'} like ${childName}, it's wise to consult a pediatrician. You can connect with one of our doctors RIGHT NOW via video call - no appointment needed!` : ''}`;
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
  
  // Default personalized response
  return `I understand your concern about ${childName}${ageText ? ` (${age} years old)` : ''}. To provide the most accurate, evidence-based advice tailored specifically to ${childName}, could you tell me more about the specific symptoms or concerns you're experiencing?${doctorRecommendation}`;
}

/**
 * Extract child information from conversation (supports both English and Chinese)
 */
function extractChildInfo(messages) {
  const info = {
    child_name: null,
    date_of_birth: null,
    gender: null,
    medical_record: null
  };
  
  // Combine all messages (keep original case for name extraction)
  const fullText = messages.map(m => m.content).join(" ");
  const lowerText = fullText.toLowerCase();
  
  // Extract name (supports English and Chinese, more patterns)
  const namePatterns = [
    // English patterns
    /(?:my child|child|kid|baby|son|daughter) (?:is|named|called|name is) ([a-z\u4e00-\u9fa5\s]+)/i,
    /(?:name is|named|called) ([a-z\u4e00-\u9fa5\s]+)/i,
    /(?:his|her) name (?:is|is called) ([a-z\u4e00-\u9fa5\s]+)/i,
    // Chinese patterns
    /(?:他|她|孩子|宝宝|儿子|女儿) (?:叫|名字是|名字叫|姓名是) ([a-z\u4e00-\u9fa5\s]+)/i,
    /(?:叫|名字是|名字叫|姓名是) ([a-z\u4e00-\u9fa5\s]+)/i,
    // Direct mention: "X is my child" or "我的孩子是X"
    /^([a-z\u4e00-\u9fa5]+) (?:is|是) (?:my|我的) (?:child|kid|baby|son|daughter|孩子|宝宝|儿子|女儿)/i,
    /(?:my|我的) (?:child|kid|baby|son|daughter|孩子|宝宝|儿子|女儿) (?:is|是) ([a-z\u4e00-\u9fa5]+)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      // Remove common words that might be captured
      name = name.replace(/\b(and|or|the|a|an|is|are|was|were|的|和|或)\b/gi, '').trim();
      
      if (name.length >= 1 && name.length <= 20 && !/^\d+$/.test(name)) {
        // Capitalize first letter for English names, keep Chinese as is
        info.child_name = /^[a-z]/.test(name) ? name.charAt(0).toUpperCase() + name.slice(1) : name;
        console.log(`👶 Extracted child name: ${info.child_name}`);
        break;
      }
    }
  }
  
  // Extract date of birth or age (supports multiple formats)
  const dobPatterns = [
    // Date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD
    /(?:born|birthday|date of birth|dob|出生|生日|出生日期) (?:on|is|是|在)?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    /(?:出生于|生日是|出生在)\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    // Standalone date patterns (more specific)
    /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
    // Age patterns (more comprehensive)
    /(?:age|年龄) (?:is|of|是)?\s*(\d+)/i,
    /(?:今年|现在|已经) (\d+) (?:岁|years? old)/i,
    /(\d+) (?:years?|months?|days?|岁|个月|天) (?:old|age)?/i,
    /(\d+) (?:岁|years? old)/i,
    /(?:孩子|宝宝|儿子|女儿) (\d+) (?:岁|years? old)/i
  ];
  
  for (const pattern of dobPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim();
      // If it's an age (just a number between 0-25), convert to approximate date of birth
      if (/^\d+$/.test(value)) {
        const ageNum = parseInt(value);
        if (ageNum >= 0 && ageNum <= 25) {
          const today = new Date();
          const birthYear = today.getFullYear() - ageNum;
          // Use January 1st as approximate date
          info.date_of_birth = `${birthYear}-01-01`;
          console.log(`📅 Extracted age ${ageNum}, calculated birth year: ${birthYear}`);
          break;
        }
      } else if (value.includes('-') || value.includes('/')) {
        // It's a date - normalize format
        let normalizedDate = value.replace(/\//g, '-');
        // Ensure YYYY-MM-DD format
        const parts = normalizedDate.split('-');
        if (parts.length === 3) {
          // If first part is 4 digits, it's YYYY-MM-DD
          if (parts[0].length === 4) {
            info.date_of_birth = normalizedDate;
          } else {
            // Might be MM-DD-YYYY or DD-MM-YYYY, try to parse
            const yearIdx = parts.findIndex(p => p.length === 4);
            if (yearIdx >= 0) {
              // Reorder to YYYY-MM-DD
              const year = parts[yearIdx];
              const month = yearIdx === 0 ? parts[1] : parts[0];
              const day = yearIdx === 2 ? parts[1] : parts[2];
              info.date_of_birth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else {
              info.date_of_birth = normalizedDate;
            }
          }
          console.log(`📅 Extracted date of birth: ${info.date_of_birth}`);
          break;
        }
      }
    }
  }
  
  // Extract gender (supports English and Chinese)
  if (lowerText.includes("boy") || lowerText.includes("son") || lowerText.includes("male") || 
      lowerText.includes("男孩") || lowerText.includes("儿子") || lowerText.includes("男")) {
    info.gender = "male";
  } else if (lowerText.includes("girl") || lowerText.includes("daughter") || lowerText.includes("female") ||
             lowerText.includes("女孩") || lowerText.includes("女儿") || lowerText.includes("女")) {
    info.gender = "female";
  }
  
  return info;
}

/**
 * Save or update child information in database
 */
async function saveChildInfo(familyId, childInfo) {
  try {
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
      // Update existing
      await pool.query(
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
          childInfo.medical_record,
          existing[0].id
        ]
      );
      console.log(`✅ Updated child info for family ${familyId}`);
    } else {
      // Insert new
      await pool.query(
        `INSERT INTO child (family_id, child_name, date_of_birth, gender, medical_record, extracted_from_chat)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [
          familyId,
          childInfo.child_name,
          childInfo.date_of_birth,
          childInfo.gender,
          childInfo.medical_record
        ]
      );
      console.log(`✅ Saved child info for family ${familyId}`);
    }
  } catch (err) {
    console.error("❌ Error saving child info:", err.message);
  }
}

/**
 * Main function to handle AI chat message
 */
async function handleChatMessage(familyId, userMessage) {
  try {
    // Get conversation history
    const history = getConversationHistory(familyId);
    
    // Add user message to history
    history.push({
      role: "user",
      content: userMessage
    });
    
    // Build system prompt
    const systemPrompt = await buildSystemPrompt(familyId);
    
    // Prepare messages for AI
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10) // Keep last 10 messages for context
    ];
    
    // Get AI response
    const aiResponse = await callAI(messages, familyId);
    
    // Add AI response to history
    history.push({
      role: "assistant",
      content: aiResponse
    });
    
    // Extract child information from conversation
    const extractedInfo = extractChildInfo(history);
    
    // Get current child info from database
    const childInfo = await getChildInfo(familyId);
    
    // Check if we extracted ANY new information (even just one field)
    const hasAnyNewInfo = extractedInfo.child_name || 
                         extractedInfo.date_of_birth || 
                         extractedInfo.gender || 
                         extractedInfo.medical_record;
    
    // If we extracted any information, save it immediately to start/update the child record
    if (hasAnyNewInfo) {
      // Merge extracted info with existing info (extracted info takes priority for new fields)
      const mergedInfo = {
        child_name: extractedInfo.child_name || childInfo?.child_name || null,
        date_of_birth: extractedInfo.date_of_birth || childInfo?.date_of_birth || null,
        gender: extractedInfo.gender || childInfo?.gender || null,
        medical_record: extractedInfo.medical_record || childInfo?.medical_record || null
      };
      
      // Save immediately - this will create a record if none exists, or update existing one
      await saveChildInfo(familyId, mergedInfo);
      
      // Log what was extracted and saved
      const extractedFields = [];
      if (extractedInfo.child_name) extractedFields.push(`name: ${extractedInfo.child_name}`);
      if (extractedInfo.date_of_birth) extractedFields.push(`date_of_birth: ${extractedInfo.date_of_birth}`);
      if (extractedInfo.gender) extractedFields.push(`gender: ${extractedInfo.gender}`);
      if (extractedInfo.medical_record) extractedFields.push(`medical_record: ${extractedInfo.medical_record}`);
      
      console.log(`✅ Child record created/updated for family ${familyId}. Extracted: ${extractedFields.join(', ')}`);
      console.log(`📋 Current child record:`, mergedInfo);
    }
    
    return {
      response: aiResponse,
      extractedInfo: hasAnyNewInfo ? extractedInfo : null
    };
  } catch (err) {
    console.error("❌ Error handling chat message:", err.message);
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

