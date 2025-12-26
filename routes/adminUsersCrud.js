/**
 * AdminUsers CRUD API
 * เพิ่ม, แก้ไข, ลบ ผู้ดูแลระบบ
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

/**
 * Middleware to get pool from app.locals
 */
router.use((req, res, next) => {
  if (!req.pool && req.app.locals && req.app.locals.pool) {
    req.pool = req.app.locals.pool;
  }
  next();
});

/**
 * GET /adminusers
 * ดึงรายการผู้ดูแลระบบทั้งหมด
 */
router.get('/', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  try {
    const [admins] = await pool.query(
      `SELECT AdminUserID, AdminName, AdminEmail, ParentAdminID
       FROM AdminUsers
       ORDER BY AdminUserID DESC`
    );

    res.status(200).json({
      success: true,
      data: admins
    });

  } catch (err) {
    console.error('Get admin users list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Generate random password (8 characters)
 */
function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * POST /adminusers
 * สร้างผู้ดูแลระบบใหม่
 */
router.post('/', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const { adminName, adminEmail } = req.body;

  if (!adminName || !adminName.trim()) {
    return res.status(400).json({ success: false, message: 'ชื่อผู้ดูแลระบบจำเป็นต้องระบุ' });
  }

  if (!adminEmail || !adminEmail.trim()) {
    return res.status(400).json({ success: false, message: 'อีเมลจำเป็นต้องระบุ' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if email already exists
    const [existingEmail] = await connection.query(
      'SELECT AdminUserID FROM AdminUsers WHERE AdminEmail = ?',
      [adminEmail.trim()]
    );

    if (existingEmail.length > 0) {
      return res.status(400).json({ success: false, message: 'อีเมลนี้มีอยู่ในระบบแล้ว' });
    }

    // Check if name already exists
    const [existingName] = await connection.query(
      'SELECT AdminUserID FROM AdminUsers WHERE AdminName = ?',
      [adminName.trim()]
    );

    if (existingName.length > 0) {
      return res.status(400).json({ success: false, message: 'ชื่อนี้มีอยู่ในระบบแล้ว' });
    }

    // Generate random password
    const plainPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Get ParentAdminID from request user (from JWT token) - default to 1 if not found
    const parentAdminId = req.user?.userId || req.user?.AdminUserID || req.user?.id || 1;

    // Insert new admin user
    const [result] = await connection.query(
      `INSERT INTO AdminUsers (AdminName, AdminEmail, AdminPassword, ParentAdminID) 
       VALUES (?, ?, ?, ?)`,
      [
        adminName.trim(),
        adminEmail.trim(),
        hashedPassword,
        parentAdminId
      ]
    );

    const newAdminId = result.insertId;

    // Try to update exported CSV for admin users (non-blocking)
    try {
      const writeCsv = require('../services/adminUsers/writeAdminUsersCSV')(req.pool, req.user?.userId || 1);
      // fire-and-forget but log errors
      writeCsv().catch(err => console.error('Error writing adminusers CSV after create:', err && err.message));
    } catch (err) {
      console.error('Could not start adminusers CSV write:', err && err.message);
    }

    res.status(201).json({
      success: true,
      message: 'เพิ่มผู้ดูแลระบบสำเร็จ',
      data: { 
        id: newAdminId, 
        name: adminName.trim(),
        generatedPassword: plainPassword
      }
    });

  } catch (err) {
    console.error('Create admin user error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// GET /adminusers/template - headers-only CSV stored separately
router.get('/template', async (req, res) => {
  try {
    const baseDir = path.join(__dirname, '..', 'files', 'manageadminusers', 'templates');
    fs.mkdirSync(baseDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `adminusers_template_${timestamp}.csv`;
    const filePath = path.join(baseDir, filename);
    const headers = 'AdminName,AdminEmail\n';
    fs.writeFileSync(filePath, headers, 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Download admin template error:', err);
    res.status(500).json({ success: false, message: 'ไม่สามารถสร้างไฟล์ตัวอย่างได้' });
  }
});

/**
 * PUT /adminusers/:id
 * แก้ไขข้อมูลผู้ดูแลระบบ
 */
router.put('/:id', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const adminId = req.params.id;
  const { adminName, adminEmail } = req.body;

  if (!adminName || !adminName.trim()) {
    return res.status(400).json({ success: false, message: 'ชื่อผู้ดูแลระบบจำเป็นต้องระบุ' });
  }

  if (!adminEmail || !adminEmail.trim()) {
    return res.status(400).json({ success: false, message: 'อีเมลจำเป็นต้องระบุ' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if admin exists
    const [existingAdmin] = await connection.query(
      'SELECT AdminUserID, ParentAdminID FROM AdminUsers WHERE AdminUserID = ?',
      [adminId]
    );

    if (existingAdmin.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ดูแลระบบที่ต้องการแก้ไข' });
    }

    // Prevent editing Super Admin (where ParentAdminID equals AdminUserID)
    if (existingAdmin[0].ParentAdminID === existingAdmin[0].AdminUserID) {
      return res.status(403).json({ success: false, message: 'ไม่สามารถแก้ไข Super Admin ได้' });
    }

    // Check if email already exists (excluding current admin)
    const [duplicateEmail] = await connection.query(
      'SELECT AdminUserID FROM AdminUsers WHERE AdminEmail = ? AND AdminUserID != ?',
      [adminEmail.trim(), adminId]
    );

    if (duplicateEmail.length > 0) {
      return res.status(400).json({ success: false, message: 'อีเมลนี้มีอยู่ในระบบแล้ว' });
    }

    // Check if name already exists (excluding current admin)
    const [duplicateName] = await connection.query(
      'SELECT AdminUserID FROM AdminUsers WHERE AdminName = ? AND AdminUserID != ?',
      [adminName.trim(), adminId]
    );

    if (duplicateName.length > 0) {
      return res.status(400).json({ success: false, message: 'ชื่อนี้มีอยู่ในระบบแล้ว' });
    }

    // Update admin user (ไม่แก้ไข password)
    await connection.query(
      `UPDATE AdminUsers SET AdminName = ?, AdminEmail = ? WHERE AdminUserID = ?`,
      [
        adminName.trim(),
        adminEmail.trim(),
        adminId
      ]
    );

    // Update exported CSV for admin users (non-blocking)
    try {
      const writeCsv = require('../services/adminUsers/writeAdminUsersCSV')(req.pool, req.user?.userId || 1);
      writeCsv().catch(err => console.error('Error writing adminusers CSV after update:', err && err.message));
    } catch (err) {
      console.error('Could not start adminusers CSV write (update):', err && err.message);
    }

    res.status(200).json({
      success: true,
      message: 'แก้ไขผู้ดูแลระบบสำเร็จ',
      data: { id: adminId, name: adminName.trim() }
    });

  } catch (err) {
    console.error('Update admin user error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * DELETE /adminusers/:id
 * ลบผู้ดูแลระบบ
 */
router.delete('/:id', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const adminId = req.params.id;

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if admin exists
    const [existingAdmin] = await connection.query(
      'SELECT AdminUserID, AdminName, ParentAdminID FROM AdminUsers WHERE AdminUserID = ?',
      [adminId]
    );

    if (existingAdmin.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ดูแลระบบที่ต้องการลบ' });
    }

    // Prevent deleting Super Admin (where ParentAdminID equals AdminUserID)
    if (existingAdmin[0].ParentAdminID === existingAdmin[0].AdminUserID) {
      return res.status(403).json({ success: false, message: 'ไม่สามารถลบ Super Admin ได้' });
    }

    // Check if this admin is a parent of other admins
    const [childAdmins] = await connection.query(
      'SELECT AdminUserID FROM AdminUsers WHERE ParentAdminID = ? AND AdminUserID != ?',
      [adminId, adminId]
    );

    if (childAdmins.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'ไม่สามารถลบได้ เนื่องจากมีผู้ดูแลระบบอื่นที่อยู่ภายใต้ผู้ดูแลนี้' 
      });
    }

    // Delete admin user
    await connection.query('DELETE FROM AdminUsers WHERE AdminUserID = ?', [adminId]);

    // Update exported CSV for admin users (non-blocking)
    try {
      const writeCsv = require('../services/adminUsers/writeAdminUsersCSV')(req.pool, req.user?.userId || 1);
      writeCsv().catch(err => console.error('Error writing adminusers CSV after delete:', err && err.message));
    } catch (err) {
      console.error('Could not start adminusers CSV write (delete):', err && err.message);
    }

    res.status(200).json({
      success: true,
      message: 'ลบผู้ดูแลระบบสำเร็จ',
      data: { id: adminId, name: existingAdmin[0].AdminName }
    });

  } catch (err) {
    console.error('Delete admin user error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
