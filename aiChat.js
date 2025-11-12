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
  
  let prompt = `You are a helpful pediatric health assistant for ParentDoctor, a platform connecting parents with pediatric doctors. Your role is to:

1. **Provide health advice**: Give helpful, general health guidance to parents about their children
2. **Recommend doctors**: When appropriate, recommend doctors from our database (see available doctors below)
3. **Gather child information naturally**: Ask about the child's information in a conversational way, but don't be too pushy. If the parent mentions their child's name, age, birthday, or gender naturally, remember it.
4. **Be part of the product**: You are an integral part of ParentDoctor. You can see our database of verified pediatric doctors and recommend them when parents need professional consultation.

**IMPORTANT GUIDELINES:**
- Ask questions naturally in conversation, not like a form. For example: "To give you the best advice, could you tell me a bit about your child? What's their name and how old are they?"
- If the parent mentions their child's information naturally, acknowledge it and remember it
- When recommending doctors, mention specific doctors from our database by name
- Always be friendly, empathetic, and helpful
- For serious health concerns, strongly recommend connecting with one of our doctors

**Available Doctors in Database:**\n`;
  
  if (doctors.length > 0) {
    doctors.forEach((doc, index) => {
      const fullName = `${doc.first_name} ${doc.last_name}`;
      const specialty = doc.major || 'Pediatrics';
      const location = doc.nation || 'Location not specified';
      prompt += `${index + 1}. Dr. ${fullName} - ${specialty} (${location})\n`;
    });
    prompt += `\nYou can recommend these doctors when parents need professional consultation.`;
  } else {
    prompt += `\nNo doctors available in database yet.`;
  }
  
  prompt += `\n\n**Current Child Information in Database:**\n`;
  
  if (childInfo) {
    const age = childInfo.date_of_birth ? calculateAge(childInfo.date_of_birth) : null;
    prompt += `- Name: ${childInfo.child_name || 'Not provided'}\n`;
    if (childInfo.date_of_birth) {
      prompt += `- Date of Birth: ${childInfo.date_of_birth}`;
      if (age !== null) {
        prompt += ` (Age: ${age} years old)`;
      }
      prompt += `\n`;
    } else {
      prompt += `- Date of Birth: Not provided\n`;
    }
    prompt += `- Gender: ${childInfo.gender || 'Not provided'}\n`;
    if (childInfo.medical_record) {
      prompt += `- Previous Medical Notes: ${childInfo.medical_record}\n`;
    }
  } else {
    prompt += `No child information in database yet. Gather this information naturally during conversation.\n`;
  }
  
  prompt += `\n**Response Style:**
- Be conversational and natural, not robotic
- Show empathy and understanding
- When you have child information, personalize your advice
- Recommend specific doctors from our database when appropriate
- Keep responses concise but helpful`;
  
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
        max_tokens: 500
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
  
  // Provide basic health advice based on keywords
  if (lastUserMessage.includes("fever") || lastUserMessage.includes("发烧")) {
    return `I understand you're concerned about ${childName}'s fever${ageText}. Here are some general suggestions:

🩺 **What You Can Do:**
• Monitor the temperature regularly
• Keep your child hydrated with water or electrolyte solutions
• Ensure they get plenty of rest
• Use age-appropriate fever reducers if needed (consult a doctor for dosage)

⚠️ **When to Seek Medical Attention:**
• Fever persists for more than 3 days
• Temperature is very high (above 104°F/40°C)
• Child shows signs of dehydration
• Child appears very unwell or lethargic
${doctorRecommendation}`;
  }
  
  if (lastUserMessage.includes("cough") || lastUserMessage.includes("咳嗽")) {
    return `I understand ${childName} has a cough${ageText}. Here are some general suggestions:

🩺 **What You Can Do:**
• Keep your child hydrated
• Use a humidifier in their room
• Ensure they get plenty of rest
• Avoid irritants like smoke

⚠️ **When to Seek Medical Attention:**
• Cough persists for more than a week
• Child has difficulty breathing
• Cough is accompanied by high fever
• Child appears distressed
${doctorRecommendation}`;
  }
  
  if (lastUserMessage.includes("doctor") || lastUserMessage.includes("医生") || 
      lastUserMessage.includes("recommend") || lastUserMessage.includes("推荐")) {
    if (doctors.length > 0) {
      const doctorList = doctors.slice(0, 3).map((doc, idx) => {
        const fullName = `${doc.first_name} ${doc.last_name}`;
        const specialty = doc.major || 'Pediatrics';
        const location = doc.nation || '';
        return `${idx + 1}. **Dr. ${fullName}** - ${specialty}${location ? ` (${location})` : ''}`;
      }).join("\n");
      return `I'd be happy to recommend a doctor for ${childName}! Here are some excellent pediatricians available on ParentDoctor:

${doctorList}

You can view their profiles above and connect with them directly. Would you like me to help you choose one based on your specific needs?`;
    } else {
      return `I understand you're looking for a doctor recommendation. Currently, we're building our network of pediatricians. In the meantime, I'm here to help with general health advice. What specific concerns do you have about ${childName}?`;
    }
  }
  
  // Default response
  return `I understand your concern about ${childName}${ageText}. To provide the best advice, could you tell me more about the specific symptoms or concerns you have?${doctorRecommendation}`;
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
  
  // Extract name (supports English and Chinese)
  // English patterns
  const namePatternsEn = [
    /(?:my child|child|kid|baby|son|daughter) (?:is|named|called|name is) ([a-z\u4e00-\u9fa5]+)/i,
    /(?:name is|named|called) ([a-z\u4e00-\u9fa5]+)/i,
    /(?:他|她|孩子|宝宝|儿子|女儿) (?:叫|名字是|名字叫) ([a-z\u4e00-\u9fa5]+)/i,
    /(?:叫|名字是|名字叫) ([a-z\u4e00-\u9fa5]+)/i
  ];
  
  for (const pattern of namePatternsEn) {
    const match = fullText.match(pattern);
    if (match && match[1] && match[1].length >= 1 && match[1].length <= 20) {
      // Capitalize first letter for English names, keep Chinese as is
      const name = match[1];
      info.child_name = /^[a-z]/.test(name) ? name.charAt(0).toUpperCase() + name.slice(1) : name;
      break;
    }
  }
  
  // Extract date of birth or age (supports multiple formats)
  const dobPatterns = [
    // Date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
    /(?:born|birthday|date of birth|dob|出生|生日) (?:on|is|是|在)?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    // Age patterns
    /(?:age|年龄) (?:is|of|是)?\s*(\d+)/i,
    /(\d+) (?:years?|months?|days?|岁|个月|天) (?:old|age)?/i,
    /(?:今年|现在) (\d+) (?:岁|years? old)/i,
    /(\d+) (?:岁|years? old)/i
  ];
  
  for (const pattern of dobPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const value = match[1];
      // If it's an age, convert to approximate date of birth
      if (/^\d+$/.test(value) && parseInt(value) < 25) {
        const age = parseInt(value);
        const today = new Date();
        const birthYear = today.getFullYear() - age;
        // Use January 1st as approximate date
        info.date_of_birth = `${birthYear}-01-01`;
      } else if (value.includes('-') || value.includes('/')) {
        // It's a date
        info.date_of_birth = value.replace(/\//g, '-');
      }
      break;
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
    // Check if child already exists
    const { rows: existing } = await pool.query(
      `SELECT id FROM child 
       WHERE family_id = $1 
       AND (child_name = $2 OR child_name IS NULL)
       ORDER BY created_at DESC 
       LIMIT 1`,
      [familyId, childInfo.child_name]
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
    
    // Merge extracted info with existing info (extracted info takes priority for new fields)
    const mergedInfo = {
      child_name: extractedInfo.child_name || childInfo?.child_name || null,
      date_of_birth: extractedInfo.date_of_birth || childInfo?.date_of_birth || null,
      gender: extractedInfo.gender || childInfo?.gender || null,
      medical_record: extractedInfo.medical_record || childInfo?.medical_record || null
    };
    
    // Check if we have any new information to save
    let hasNewInfo = false;
    if (extractedInfo.child_name && (!childInfo || !childInfo.child_name)) {
      hasNewInfo = true;
    }
    if (extractedInfo.date_of_birth && (!childInfo || !childInfo.date_of_birth)) {
      hasNewInfo = true;
    }
    if (extractedInfo.gender && (!childInfo || !childInfo.gender)) {
      hasNewInfo = true;
    }
    
    // Save if we have at least one piece of new information
    if (hasNewInfo && (mergedInfo.child_name || mergedInfo.date_of_birth || mergedInfo.gender)) {
      await saveChildInfo(familyId, mergedInfo);
      console.log(`✅ Saved/updated child info:`, mergedInfo);
    }
    
    return {
      response: aiResponse,
      extractedInfo: hasNewInfo ? extractedInfo : null
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

