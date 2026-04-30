const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnvVar = (name) => {
  const match = envContent.match(new RegExp(`${name}=(.*)`));
  return match ? match[1].trim() : '';
};

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

console.log('Testing connection to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  try {
    // 1. 테이블 목록 또는 특정 테이블 확인
    const { data, error } = await supabase.from('current_meal_state').select('*');
    
    if (error) {
      console.error('Connection/Query failed:', error.message);
      if (error.code === '42P01') {
        console.error('Table "current_meal_state" does not exist. Please run the SQL schema in Supabase SQL Editor.');
      }
      process.exit(1);
    } else {
      console.log('Successfully connected to Supabase!');
      console.log(`Found ${data.length} row(s) in "current_meal_state" table.`);
      
      if (data.length === 0) {
        console.log('Table is empty. Initializing with default data...');
        const { error: insError } = await supabase.from('current_meal_state').insert({
          id: 1,
          menus: [],
          settings: { weekTitle: '식단표를 작성해주세요' },
          today_lunch: {}
        });
        if (insError) console.error('Initialization failed:', insError.message);
        else console.log('Successfully initialized table!');
      }
      
      process.exit(0);
    }
  } catch (err) {
    console.error('Unexpected error:', err.message);
    process.exit(1);
  }
}

test();
