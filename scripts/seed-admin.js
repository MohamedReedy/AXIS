import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wrvpylbiyinkrfakudjr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndydnB5bGJpeWlua3JmYWt1ZGpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTEyOTg2MSwiZXhwIjoyMTA0NzA1ODYxfQ.oYs1IZy4vF65P7LdJ8wfvg3V5gB043vMGaipbnt1R2Y';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function seedAdmin() {
  const email = 'mohamedreedy@axis.learning';
  const password = '502439937';
  const fullName = 'Mohamed Reedy';

  console.log(`🌱 Seeding admin user: ${email}...`);

  try {
    // 1. Check if user already exists
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    let existingUser = null;
    if (!listError && usersData?.users) {
      existingUser = usersData.users.find(u => u.email === email);
    }

    let userId = null;

    if (existingUser) {
      console.log(`User ${email} already exists with ID: ${existingUser.id}. Updating password...`);
      userId = existingUser.id;
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: 'admin' }
      });
      if (updateError) {
        console.error('Error updating user password:', updateError.message);
      } else {
        console.log('Password updated successfully!');
      }
    } else {
      // Create user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: 'admin' }
      });

      if (createError) {
        throw createError;
      }

      userId = newUser.user.id;
      console.log(`✅ Admin user created successfully with ID: ${userId}`);
    }

    // 2. Ensure profile has role = 'admin'
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        full_name: fullName,
        email: email,
        role: 'admin',
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.warn('Note on profile upsert:', profileError.message);
    } else {
      console.log('✅ Admin profile successfully updated to role: admin');
    }

    console.log('\n=============================================');
    console.log('🎉 SEEDING COMPLETED');
    console.log(`Admin Email:    ${email}`);
    console.log(`Admin Password: ${password}`);
    console.log(`Role:           admin`);
    console.log('=============================================\n');

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
  }
}

seedAdmin();
