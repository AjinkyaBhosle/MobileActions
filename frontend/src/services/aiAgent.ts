import axios from 'axios';

// IMPORTANT: Replace this with your actual OpenAI API Key for local testing.
// NEVER commit this file with your real key if you publish the app to Github or Play Store!
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY_HERE";

export interface AIActionResponse {
  action: string;
  params?: Record<string, any>;
}

export const processCommandWithAI = async (commandText: string): Promise<AIActionResponse[]> => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_API_KEY_HERE") {
    console.error("[AI Agent] Missing API Key. Please add it to src/services/aiAgent.ts");
    throw new Error("Missing OpenAI API Key");
  }

  const systemPrompt = `
You are the intelligent Brain for a mobile automation agent. 
Your job is to read the user's natural language command and convert it into exactly one or more JSON objects.
You control the user's Android phone.

Available actions you can perform:
1. "flashlight_on": Turns the flashlight on.
2. "flashlight_off": Turns the flashlight off.
3. "call": Calls a phone number or contact. Requires 'nameOrNumber' in params.
4. "send_sms": Sends a text message. Requires 'nameOrNumber' and 'message' in params.
5. "set_alarm": Sets an alarm. Requires 'time' in params (format HH:MM).
6. "open_camera": Opens the camera app.
7. "navigate": Opens maps to a destination. Requires 'location' in params.
8. "volume_up": Increases volume.
9. "volume_down": Decreases volume.

Output Requirements:
Return a JSON array of action objects. 
Example Output: 
[
  {"action": "flashlight_on", "params": {}},
  {"action": "send_sms", "params": {"nameOrNumber": "John", "message": "I'll be late"}}
]
Do not output markdown, just the raw JSON array.
`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: commandText }
        ],
        temperature: 0.1,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices[0].message.content.trim();
    // Clean up potential markdown formatting
    const jsonString = reply.replace(/```json/g, '').replace(/```/g, '').trim();
    const actions = JSON.parse(jsonString) as AIActionResponse[];
    return actions;
    
  } catch (error) {
    console.error("[AI Agent] Failed to process command:", error);
    throw error;
  }
};
