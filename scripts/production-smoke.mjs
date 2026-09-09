const baseUrl = process.env.EDUFLOW_BASE_URL ?? "https://eduflow-platform-hazel.vercel.app";
const paths = ["/", "/auth"];
for (const path of paths) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "follow" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const html = await response.text();
  if (!html || html.length < 100) throw new Error(`${path} returned an unexpectedly small response`);
  console.log(`PASS ${path}: ${response.status} (${html.length} bytes)`);
}
