/**
 * 检查脚本：检查指定邮箱在数据库中的状态
 * 使用方法：node check_email.js <email>
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkEmail(email) {
  if (!email) {
    console.error('❌ 请提供邮箱地址');
    console.log('使用方法: node check_email.js <email>');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log(`🔍 检查邮箱: ${normalizedEmail}\n`);

  try {
    // 1. 检查 family_member 表
    const { rows: members } = await pool.query(
      'SELECT id, family_id, email, phone, role, created_at FROM family_member WHERE lower(email) = $1',
      [normalizedEmail]
    );

    console.log(`📊 family_member 表:`);
    if (members.length === 0) {
      console.log('   ✅ 没有找到记录');
    } else {
      console.log(`   ⚠️  找到 ${members.length} 条记录:`);
      members.forEach((m, i) => {
        console.log(`   ${i + 1}. ID: ${m.id}, Family ID: ${m.family_id}, Role: ${m.role || 'N/A'}, Created: ${m.created_at}`);
      });
    }

    // 2. 检查相关的 family 记录
    if (members.length > 0) {
      const familyIds = [...new Set(members.map(m => m.family_id))];
      console.log(`\n📊 相关家庭 (${familyIds.length} 个):`);
      
      for (const familyId of familyIds) {
        const { rows: families } = await pool.query(
          'SELECT family_id, family_name, device_id, invite_code, created_at FROM family WHERE family_id = $1',
          [familyId]
        );
        
        if (families.length > 0) {
          const f = families[0];
          console.log(`   - Family ID: ${f.family_id}`);
          console.log(`     名称: ${f.family_name || 'N/A'}`);
          console.log(`     设备ID: ${f.device_id || 'N/A'}`);
          console.log(`     邀请码: ${f.invite_code || 'N/A'}`);
          console.log(`     创建时间: ${f.created_at}`);
        }
      }
    }

    // 3. 检查是否有其他成员
    if (members.length > 0) {
      const familyIds = [...new Set(members.map(m => m.family_id))];
      for (const familyId of familyIds) {
        const { rows: allMembers } = await pool.query(
          'SELECT COUNT(*) as count FROM family_member WHERE family_id = $1',
          [familyId]
        );
        const count = parseInt(allMembers[0].count);
        console.log(`\n📊 家庭 ${familyId} 共有 ${count} 个成员`);
      }
    }

    console.log('\n' + '='.repeat(50));
    if (members.length > 0) {
      console.log('⚠️  该邮箱在数据库中仍有记录！');
      console.log('   如果需要清理，请运行: ./cleanup_email.sh <email>');
    } else {
      console.log('✅ 该邮箱在数据库中没有任何记录');
      console.log('   如果仍然遇到问题，可能是验证码缓存问题，需要重启服务器');
    }

  } catch (err) {
    console.error('❌ 检查失败:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

// 从命令行参数获取邮箱
const email = process.argv[2];
checkEmail(email)
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ 脚本执行失败:', err);
    process.exit(1);
  });

