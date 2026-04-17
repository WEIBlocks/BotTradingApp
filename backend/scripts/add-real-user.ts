/**
 * Add the real user account (farooqtariq400@gmail.com) to the new DB
 * with a known password so the app still works.
 */
import { db } from '../src/config/database.js';
import { users } from '../src/db/schema/users.js';
import { hashPassword } from '../src/lib/password.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Check if already exists
  const [existing] = await (db as any).execute(
    sql`SELECT id, email FROM users WHERE email = 'farooqtariq400@gmail.com' LIMIT 1`
  );
  if (existing) {
    console.log('User already exists:', existing.email, existing.id);
    process.exit(0);
  }

  const passwordHash = await hashPassword('Password123!');

  const [newUser] = await db.insert(users).values({
    email: 'farooqtariq400@gmail.com',
    passwordHash,
    name: 'Muhammad Farooq',
    avatarInitials: 'MF',
    avatarColor: '#6C5CE7',
    role: 'creator',
    riskTolerance: 70,
    investmentGoal: 'Aggressive Growth',
    referralCode: 'FAROOQ24',
    onboardingComplete: true,
  }).returning();

  console.log('Created user:', newUser.email, newUser.id);
  console.log('Password: Password123!');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
