const prisma = require('../config/prisma');

async function main() {
  console.log('Connecting to PostgreSQL...');
  await prisma.$connect();
  console.log('Connected!');

  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log('\n--- Tables in public schema ---');
  tables.forEach(t => console.log('✓ ' + t.table_name));

  const fks = await prisma.$queryRaw`
    SELECT
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name;
  `;
  console.log('\n--- Foreign Keys (' + fks.length + ' total) ---');
  fks.forEach(fk => console.log('✓ ' + fk.table_name + '.' + fk.column_name + ' -> ' + fk.foreign_table_name + '.' + fk.foreign_column_name));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});

