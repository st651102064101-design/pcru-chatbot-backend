/**
 * Organizations CRUD API
 * เพิ่ม, แก้ไข, ลบ หน่วยงาน
 */

const express = require('express');
const router = express.Router();
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
 * GET /organizations/crud/list
 * ดึงรายการหน่วยงานทั้งหมด
 */
router.get('/list', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  try {
    const [organizations] = await pool.query(
      `SELECT OrgID, OrgName, OrgDescription, AdminUserID
       FROM Organizations
       ORDER BY OrgID DESC`
    );

    res.status(200).json({
      success: true,
      data: organizations
    });

  } catch (err) {
    console.error('Get organizations list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /organizations/crud/create
 * เพิ่มหน่วยงานใหม่
 */
router.post('/create', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const { orgName, orgDescription } = req.body;

  if (!orgName || !orgName.trim()) {
    return res.status(400).json({ success: false, message: 'ชื่อหน่วยงานจำเป็นต้องระบุ' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if name already exists
    const [existing] = await connection.query(
      'SELECT OrgID FROM Organizations WHERE OrgName = ?',
      [orgName.trim()]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'ชื่อหน่วยงานนี้มีอยู่ในระบบแล้ว' });
    }

    // Get AdminUserID from request user (from JWT token) - default to 1 if not found
    const adminUserId = req.user?.userId || req.user?.AdminUserID || req.user?.id || 1;

    // Insert new organization
    const [result] = await connection.query(
      `INSERT INTO Organizations (OrgName, OrgDescription, AdminUserID) 
       VALUES (?, ?, ?)`,
      [
        orgName.trim(),
        orgDescription?.trim() || null,
        adminUserId
      ]
    );

    const newOrgId = result.insertId;

    res.status(201).json({
      success: true,
      message: 'เพิ่มหน่วยงานสำเร็จ',
      data: { 
        id: newOrgId, 
        name: orgName.trim()
      }
    });

  } catch (err) {
    console.error('Create organization error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// GET /organizations/crud/template - headers-only CSV stored separately from uploads
router.get('/template', async (req, res) => {
  try {
    const baseDir = path.join(__dirname, '..', 'files', 'manageorganizations', 'templates');
    fs.mkdirSync(baseDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `organizations_template_${timestamp}.csv`;
    const filePath = path.join(baseDir, filename);
    const headers = 'OrgName,OrgDescription\n';
    fs.writeFileSync(filePath, headers, 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Download org template error:', err);
    res.status(500).json({ success: false, message: 'ไม่สามารถสร้างไฟล์ตัวอย่างได้' });
  }
});

/**
 * PUT /organizations/crud/update/:id
 * แก้ไขหน่วยงาน
 */
router.put('/update/:id', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const orgId = req.params.id;
  const { orgName, orgDescription } = req.body;

  if (!orgName || !orgName.trim()) {
    return res.status(400).json({ success: false, message: 'ชื่อหน่วยงานจำเป็นต้องระบุ' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if organization exists
    const [existingOrg] = await connection.query(
      'SELECT OrgID FROM Organizations WHERE OrgID = ?',
      [orgId]
    );

    if (existingOrg.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบหน่วยงานที่ต้องการแก้ไข' });
    }

    // Check if name already exists (excluding current organization)
    const [duplicateName] = await connection.query(
      'SELECT OrgID FROM Organizations WHERE OrgName = ? AND OrgID != ?',
      [orgName.trim(), orgId]
    );

    if (duplicateName.length > 0) {
      return res.status(400).json({ success: false, message: 'ชื่อหน่วยงานนี้มีอยู่ในระบบแล้ว' });
    }

    // Update organization
    await connection.query(
      `UPDATE Organizations SET OrgName = ?, OrgDescription = ? WHERE OrgID = ?`,
      [
        orgName.trim(),
        orgDescription?.trim() || null,
        orgId
      ]
    );

    res.status(200).json({
      success: true,
      message: 'แก้ไขหน่วยงานสำเร็จ',
      data: { id: orgId, name: orgName.trim() }
    });

  } catch (err) {
    console.error('Update organization error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * DELETE /organizations/crud/delete/:id
 * ลบหน่วยงาน
 */
router.delete('/delete/:id', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const orgId = req.params.id;

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if organization exists
    const [existingOrg] = await connection.query(
      'SELECT OrgID, OrgName FROM Organizations WHERE OrgID = ?',
      [orgId]
    );

    if (existingOrg.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบหน่วยงานที่ต้องการลบ' });
    }

    // Check if organization is being used by officers
    const [officers] = await connection.query(
      'SELECT OfficerID FROM Officers WHERE OrgID = ? LIMIT 1',
      [orgId]
    );

    if (officers.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'ไม่สามารถลบหน่วยงานนี้ได้ เนื่องจากมีเจ้าหน้าที่อยู่ในหน่วยงาน' 
      });
    }

    // Delete organization
    await connection.query('DELETE FROM Organizations WHERE OrgID = ?', [orgId]);

    res.status(200).json({
      success: true,
      message: 'ลบหน่วยงานสำเร็จ',
      data: { id: orgId, name: existingOrg[0].OrgName }
    });

  } catch (err) {
    console.error('Delete organization error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
