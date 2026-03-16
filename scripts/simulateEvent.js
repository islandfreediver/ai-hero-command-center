const [eventType = "coding", projectId = "", ...messageParts] = process.argv.slice(2);
const message = messageParts.join(" ") || `Simulated ${eventType} event.`;

const response = await fetch(`http://localhost:3000/api/simulate/${eventType}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    message,
    projectId: projectId || undefined
  })
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(errorText);
  process.exit(1);
}

const payload = await response.json();
console.log(`Sent ${payload.events.length} ${eventType} event(s) to ai-bug-battle-arena.`);
