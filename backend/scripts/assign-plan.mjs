import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://yejiqenqdzupauddjcyi.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set');
  console.error('Please set the environment variable:');
  console.error('export SUPABASE_SERVICE_ROLE_KEY="your-key-here"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function assignPlan() {
  const targetName = 'Merz.paul.777';
  const planId = 'elite'; // Ultimate
  const durationDays = 1095; // 3 Jahre

  console.log(`🔍 Suche nach Nutzer: ${targetName}`);

  // List all users (with pagination) to find by name/metadata
  let allUsers = [];
  let page = 1;
  const perPage = 200;

  // Fetch all users across all pages
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error('❌ Fehler beim Abrufen der Nutzer:', error.message);
      process.exit(1);
    }

    const users = data?.users || [];
    allUsers.push(...users);

    if (users.length < perPage) break;
    page++;
  }

  console.log(`   (${allUsers.length} Nutzer durchsucht)`);

  // Find user by name in metadata or email (with flexible matching)
  let targetUser = null;

  for (const user of allUsers) {
    const metadata = user.user_metadata || {};
    const nickname = metadata.nickname || '';
    const fullName = metadata.full_name || '';
    const email = user.email || '';

    // Exact matches
    if (email === targetName || nickname === targetName || fullName === targetName) {
      targetUser = user;
      break;
    }

    // Flexible matches (case-insensitive, substring)
    const searchStr = targetName.toLowerCase();
    if (email.toLowerCase().includes(searchStr) ||
        nickname.toLowerCase().includes(searchStr) ||
        fullName.toLowerCase().includes(searchStr)) {
      targetUser = user;
      break;
    }
  }

  if (!targetUser) {
    console.error(`❌ Nutzer nicht gefunden: ${targetName}`);
    console.log('\n📋 Top 20 Nutzer (nach letzter Anmeldung):');
    const sorted = allUsers
      .sort((a, b) => new Date(b.last_sign_in_at || 0) - new Date(a.last_sign_in_at || 0))
      .slice(0, 20);
    sorted.forEach(u => {
      const meta = u.user_metadata || {};
      const name = meta.nickname || meta.full_name || u.email;
      const lastLogin = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('de-DE') : 'nie';
      console.log(`  - ${u.id}`);
      console.log(`    Name: ${name}`);
      console.log(`    Email: ${u.email}`);
      console.log(`    Letzter Login: ${lastLogin}\n`);
    });
    process.exit(1);
  }
  
  console.log(`✅ Nutzer gefunden: ${targetUser.email}`);
  console.log(`   ID: ${targetUser.id}`);
  
  // Update app_metadata with plan info
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  
  const appMetadata = targetUser.app_metadata || {};
  appMetadata.premium_plan_id = planId;
  appMetadata.premium_expires_at = expiresAt.toISOString();
  appMetadata.premium_payment_method = 'admin';
  appMetadata.premium_assigned_by = 'claude-script';
  appMetadata.premium_assigned_at = now.toISOString();
  
  console.log(`\n📝 Neue Plan-Metadaten:`);
  console.log(`   Plan: ${planId} (Ultimate)`);
  console.log(`   Verfügbar bis: ${expiresAt.toLocaleDateString('de-DE')}`);
  console.log(`   Methode: admin-assignment`);
  
  // Update user
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    targetUser.id,
    { app_metadata: appMetadata }
  );
  
  if (updateError) {
    console.error('❌ Fehler beim Aktualisieren:', updateError.message);
    process.exit(1);
  }
  
  console.log(`\n✅ Plan erfolgreich zugewiesen!`);
  console.log(`   Nutzer ${targetUser.email} hat jetzt Ultimate für 3 Jahre`);
}

assignPlan().catch(err => {
  console.error('❌ Fehler:', err.message);
  process.exit(1);
});
