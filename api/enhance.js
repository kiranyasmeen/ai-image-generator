async function enhanceViaHF(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://api-inference.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model: 'mistralai/Mistral-7B-Instruct-v0.3',
        messages: [
          {
            role:    'system',
            content: 'You are a Stable Diffusion prompt engineer. Rewrite user prompts into highly detailed image generation prompts. Reply with ONLY the enhanced prompt in max 60 words.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens:  120,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HF ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const prompt = (req.query.prompt || '').trim();
  if (!prompt) { res.status(400).json({ error: 'prompt is required' }); return; }
  const fallback = `${prompt}, highly detailed, photorealistic, cinematic lighting, 8k, masterpiece, sharp focus`;
  try {
    const enhanced = (process.env.HF_API_KEY || process.env.HF_TOKEN) ? await enhanceViaHF(prompt) : fallback;
    res.status(200).json({ enhanced: enhanced || fallback });
  } catch (e) {
    res.status(200).json({ enhanced: fallback });
  }
}
