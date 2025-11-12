/**
 * 清理脚本：删除指定邮箱的所有相关记录
 * 使用方法：node cleanup_email.js <email>
 * 
 * 注意：此脚本会永久删除数据，请谨慎使用
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function cleanupEmail(email) {
  if (!email) {
    console.error('❌ 请提供邮箱地址');
    console.log('使用方法: node cleanup_email.js <email>');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log(`🔍 开始清理邮箱: ${normalizedEmail}`);

  try {
    // 开始事务
    await pool.query('BEGIN');

    // 1. 查找所有相关的 family_member 记录
    const { rows: members } = await pool.query(
      'SELECT id, family_id, email FROM family_member WHERE lower(email) = $1',
      [normalizedEmail]
    );

    console.log(`📊 找到 ${members.length} 个家庭成员记录`);

    if (members.length === 0) {
      console.log('✅ 没有找到相关记录，邮箱可能已经被清理');
      await pool.query('COMMIT');
      await pool.end();
      return;
    }

    // 2. 获取所有相关的 family_id
    const familyIds = [...new Set(members.map(m => m.family_id))];
    console.log(`📊 涉及 ${familyIds.length} 个家庭`);

    // 3. 删除 family_member 记录
    const deleteMembersResult = await pool.query(
      'DELETE FROM family_member WHERE lower(email) = $1',
      [normalizedEmail]
    );
    console.log(`✅ 删除了 ${deleteMembersResult.rowCount} 个家庭成员记录`);

    // 4. 检查每个家庭是否还有其他成员
    for (const familyId of familyIds) {
      const { rows: remainingMembers } = await pool.query(
        'SELECT COUNT(*) as count FROM family_member WHERE family_id = $1',
        [familyId]
      );

      const count = parseInt(remainingMembers[0].count);
      if (count === 0) {
        console.log(`⚠️  家庭 ${familyId} 没有其他成员，但保留家庭记录（可能有关联的设备或孩子）`);
        // 可以选择删除家庭记录，但为了安全，这里保留
        // await pool.query('DELETE FROM family WHERE family_id = $1', [familyId]);
      }
    }

    // 5. 清理验证码缓存（如果使用内存存储）
    console.log('ℹ️  注意：验证码缓存需要重启服务器才能清除');

    await pool.query('COMMIT');
    console.log('✅ 清理完成！');

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('❌ 清理失败:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

// 从命令行参数获取邮箱
const email = process.argv[2];
cleanupEmail(email)
  .then(() => {
    console.log('✅ 脚本执行完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ 脚本执行失败:', err);
    process.exit(1);
  });

