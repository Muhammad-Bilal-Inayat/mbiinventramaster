// AI client — Groq, env-based only.
// The API key is NEVER in Git, NEVER in a request body, and NEVER logged.
// It comes only from the server env GROQ_API_KEY, set on the server where
// the app runs. If it is missing, chat returns 503 AI_NOT_CONFIGURED —
// never a fake answer. A key that was ever shared in chat is compromised
// and must be revoked at the Groq console first; this code cannot tell a
// revoked key from a valid one, it only forwards the env value.

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chatWithGroq(messages: AiMessage[], tenantContext: string): Promise<{ answer: string; model: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const systemPrompt = [
    "You are the MBI Inventra pharmacy assistant for one tenant only.",
    "Answer in the user's language (Roman Urdu or English, matching the user).",
    "Use only the tenant context below. Never invent stock, prices, sales, or other tenants' data.",
    "If the context does not contain an answer, say so plainly instead of guessing.",
    "This is a pharmacy operations assistant, not a medical diagnosis service. For medicine use, advise consulting a qualified pharmacist or doctor.",
    `Tenant context: ${tenantContext}`,
  ].join("\n");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.3,
      max_tokens: 800,
    }),
  });
  if (!response.ok) throw new Error("AI_PROVIDER_ERROR");
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("AI_PROVIDER_ERROR");
  return { answer, model };
}
