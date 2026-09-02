import { seedCatalog } from "./_lib/seedCatalog";

const result = await seedCatalog();
process.stdout.write(`${JSON.stringify({ event: "seed_complete", ...result })}\n`);
