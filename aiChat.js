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
 * Build system prompt for AI assistant
 */
async function buildSystemPrompt(familyId) {
  const childInfo = await getChildInfo(familyId);
  
  let prompt = `You are a helpful pediatric health assistant for ParentDoctor app. Your role is to:
1. Provide general health advice and guidance to parents
2. Ask questions to gather information about their child when needed
3. Extract and remember child information from conversations

IMPORTANT: Before giving specific health advice, you should ask about:
- Child's name
- Child's date of birth (or age)
- Child's gender
- Current symptoms or concerns

When you have enough information, provide helpful, general health advice. Always remind parents that for serious concerns, they should consult with a doctor.

Current child information in database: `;
  
  if (childInfo) {
    prompt += `\n- Name: ${childInfo.child_name || 'Not provided'}\n`;
    prompt += `- Date of Birth: ${childInfo.date_of_birth || 'Not provided'}\n`;
    prompt += `- Gender: ${childInfo.gender || 'Not provided'}\n`;
    prompt += `- Medical Record: ${childInfo.medical_record || 'None'}\n`;
  } else {
    prompt += `\nNo child information in database yet. Please ask the parent for this information.`;
  }
  
  prompt += `\n\nKeep your responses concise, friendly, and helpful. Ask one question at a time.`;
  
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
    // Use Node.js built-in fetch (available in Node 18+) or require https/http
    let fetch;
    if (typeof globalThis.fetch !== 'undefined') {
      fetch = globalThis.fetch;
    } else {
      // Fallback for older Node.js versions
      const https = require('https');
      const http = require('http');
      const { URL } = require('url');
      fetch = async (url, options) => {
        return new Promise((resolve, reject) => {
          const urlObj = new URL(url);
          const lib = urlObj.protocol === 'https:' ? https : http;
          const data = JSON.stringify(options.body);
          
          const req = lib.request({
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: options.method || 'GET',
            headers: options.headers || {}
          }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                json: async () => JSON.parse(body),
                text: async () => body
              });
            });
          });
          
          req.on('error', reject);
          if (data) req.write(data);
          req.end();
        });
      };
    }
    
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or "gpt-3.5-turbo" for cheaper option
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ OpenAI API error:", error);
      return generateRuleBasedResponse(messages, familyId);
    }

    const data = await response.json();
    return data.choices[0].message.content;
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
  
  // Check if we need to ask for child information
  if (!childInfo || !childInfo.child_name) {
    return "Hello! I'm here to help you with your child's health. To provide the best advice, could you please tell me your child's name?";
  }
  
  if (!childInfo.date_of_birth) {
    return `Thank you, ${childInfo.child_name}! Could you please tell me your child's date of birth or age?`;
  }
  
  if (!childInfo.gender) {
    return `Could you please tell me your child's gender?`;
  }
  
  // Provide basic health advice based on keywords
  if (lastUserMessage.includes("fever") || lastUserMessage.includes("发烧")) {
    return `I understand you're concerned about ${childInfo.child_name}'s fever. Here are some general suggestions:

🩺 What You Can Do:
• Monitor the temperature regularly
• Keep your child hydrated with water or electrolyte solutions
• Ensure they get plenty of rest
• Use age-appropriate fever reducers if needed (consult a doctor for dosage)

⚠️ When to Seek Medical Attention:
• Fever persists for more than 3 days
• Temperature is very high (above 104°F/40°C)
• Child shows signs of dehydration
• Child appears very unwell or lethargic

Would you like me to connect you with one of our pediatricians for a consultation?`;
  }
  
  if (lastUserMessage.includes("cough") || lastUserMessage.includes("咳嗽")) {
    return `I understand ${childInfo.child_name} has a cough. Here are some general suggestions:

🩺 What You Can Do:
• Keep your child hydrated
• Use a humidifier in their room
• Ensure they get plenty of rest
• Avoid irritants like smoke

⚠️ When to Seek Medical Attention:
• Cough persists for more than a week
• Child has difficulty breathing
• Cough is accompanied by high fever
• Child appears distressed

Would you like me to connect you with one of our pediatricians?`;
  }
  
  // Default response
  return `I understand your concern about ${childInfo.child_name}. To provide the best advice, could you tell me more about the specific symptoms or concerns you have?`;
}

/**
 * Extract child information from conversation
 */
function extractChildInfo(messages) {
  const info = {
    child_name: null,
    date_of_birth: null,
    gender: null,
    medical_record: null
  };
  
  // Combine all messages
  const fullText = messages.map(m => m.content).join(" ").toLowerCase();
  
  // Extract name (look for patterns like "my child is named X" or "X is my child")
  const namePatterns = [
    /(?:my child|child|kid|baby|son|daughter) (?:is|named|called) ([a-z]+)/i,
    /(?:name is|named) ([a-z]+)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      info.child_name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      break;
    }
  }
  
  // Extract date of birth or age
  const dobPatterns = [
    /(?:born|birthday|date of birth|dob) (?:on|is)? (\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i,
    /(\d+) (?:years?|months?|days?) old/i,
    /age (?:is|of) (\d+)/i
  ];
  
  for (const pattern of dobPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      info.date_of_birth = match[1];
      break;
    }
  }
  
  // Extract gender
  if (fullText.includes("boy") || fullText.includes("son") || fullText.includes("male")) {
    info.gender = "male";
  } else if (fullText.includes("girl") || fullText.includes("daughter") || fullText.includes("female")) {
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
    
    // Save child information if we have new data
    const childInfo = await getChildInfo(familyId);
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
    
    if (hasNewInfo) {
      await saveChildInfo(familyId, extractedInfo);
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

