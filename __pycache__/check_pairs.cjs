const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  const ids = [
    '404350a4-0599-4322-b04b-aac59f2ee2a8',  // ETH Scalper
    'cf601e44-a878-450f-ae0d-42627b04c3bf',  // SOL DeFi Hunter
    '343627af-6310-4632-b960-a14ca85d7a31',  // Forex Majors Grid
    '12f4fa3c-bf6c-43a9-bf7b-a3aa5895ce07',
    '57dd1b61-bcd0-403b-8566-1c4f5e90d808',
    '98e32b1c-af98-47c3-97b7-4963f8ad184f',  // DCA Smart Bot
  ];
  for (const id of ids) {
    const r = await sql`SELECT name, category, config FROM bots WHERE id = ${id}`;
    if (!r.length) { console.log(`${id} NOT FOUND`); continue; }
    const b = r[0];
    const cfg = b.config || {};
    console.log(`${b.name} (${b.category})`);
    console.log(`  config keys: ${Object.keys(cfg).join(',')}`);
    console.log(`  config.pairs = ${JSON.stringify(cfg.pairs)}`);
    console.log(`  config.symbols = ${JSON.stringify(cfg.symbols)}`);
    console.log(`  config.tradingPairs = ${JSON.stringify(cfg.tradingPairs)}`);
  }
  await sql.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
