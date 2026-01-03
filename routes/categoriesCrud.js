/**
 * Categories CRUD API
 * เพิ่ม, แก้ไข, ลบ หมวดหมู่ แบบง่ายๆ
 */

const express = require('express');
const router = express.Router();

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
 * GET /categories/list
 * ดึงรายการหมวดหมู่ทั้งหมด
 */
router.get('/list', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  try {
    const [categories] = await pool.query(
      `SELECT c.CategoriesID, c.CategoriesName, c.CategoriesDetail,
              COUNT(qa.QuestionsAnswersID) AS qaCount
       FROM Categories c
       LEFT JOIN QuestionsAnswers qa ON c.CategoriesID = qa.CategoriesID
       GROUP BY c.CategoriesID, c.CategoriesName, c.CategoriesDetail
       ORDER BY c.CategoriesName`
    );

    res.status(200).json({
      success: true,
      data: categories
    });

  } catch (err) {
    console.error('Get categories list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /categories/create
 * เพิ่มหมวดหมู่ใหม่
 */
router.post('/create', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const { categoriesName, parentCategoriesID, categoriesPDF } = req.body;

  if (!categoriesName || !categoriesName.trim()) {
    return res.status(400).json({ success: false, message: 'categoriesName จำเป็นต้องระบุ' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Determine OfficerID from authenticated user
    let officerID = req.user?.userId ?? req.user?.OfficerID ?? null;

    // Verify OfficerID exists in Officers table; if not, set to null to avoid FK errors
    let currentOfficerOrgID = null;
    if (officerID !== null) {
      const [foundOfficer] = await connection.query('SELECT OfficerID, OrgID FROM Officers WHERE OfficerID = ? LIMIT 1', [officerID]);
      if (!foundOfficer || foundOfficer.length === 0) {
        console.warn(`[categoriesCrud] OfficerID ${officerID} not found, setting OfficerID=null`);
        officerID = null;
      } else {
        currentOfficerOrgID = foundOfficer[0].OrgID;
      }
    }

    // For sub-categories: check duplicate name within same parent (parent must be same)
    if (parentCategoriesID) {
      const [duplicateCheck] = await connection.query(`
        SELECT c.CategoriesID, c.OfficerID, o.OrgID 
        FROM Categories c 
        LEFT JOIN Officers o ON c.OfficerID = o.OfficerID
        WHERE c.CategoriesName = ? 
          AND c.ParentCategoriesID = ?
      `, [categoriesName.trim(), parentCategoriesID]);

      if (duplicateCheck.length > 0) {
        // Check if any duplicate shares same officer OR same organization
        for (const dup of duplicateCheck) {
          // Same officer (including NULL)
          if (dup.OfficerID === officerID) {
            return res.status(400).json({ success: false, message: 'ข้อมูลซ้ำ - ชื่อหมวดหมู่ย่อยนี้มีอยู่แล้วสำหรับเจ้าหน้าที่คนนี้' });
          }
          // Same organization
          if (currentOfficerOrgID && dup.OrgID === currentOfficerOrgID) {
            return res.status(400).json({ success: false, message: 'ข้อมูลซ้ำ - ชื่อหมวดหมู่ย่อยนี้มีอยู่แล้วในหน่วยงานเดียวกัน' });
          }
        }
      }
    }

    // Generate new CategoriesID
    let newCategoryId;
    
    if (!parentCategoriesID) {
      // Main category: find next available number (1, 2, 3, 4, ...)
      const [allIds] = await connection.query(
        'SELECT CategoriesID FROM Categories WHERE CategoriesID REGEXP \'^[0-9]+$\' ORDER BY CAST(CategoriesID AS UNSIGNED)'
      );
      const numbers = allIds.map(r => parseInt(r.CategoriesID)).filter(n => !isNaN(n));
      const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
      newCategoryId = String(maxNum + 1);
    } else {
      // Sub category: find next sub-number under parent (1-1, 1-2, 2-1, ...)
      const [subIds] = await connection.query(
        'SELECT CategoriesID FROM Categories WHERE ParentCategoriesID = ? AND CategoriesID LIKE ?',
        [parentCategoriesID, `${parentCategoriesID}-%`]
      );
      const subNumbers = subIds
        .map(r => {
          const parts = String(r.CategoriesID).split('-');
          return parts.length === 2 ? parseInt(parts[1]) : 0;
        })
        .filter(n => !isNaN(n));
      const maxSubNum = subNumbers.length > 0 ? Math.max(...subNumbers) : 0;
      newCategoryId = `${parentCategoriesID}-${maxSubNum + 1}`;
    }

    // Insert new category with generated ID (retry with OfficerID=null if FK reference fails)
    try {
      await connection.query(
        `INSERT INTO Categories (CategoriesID, CategoriesName, OfficerID, ParentCategoriesID, CategoriesPDF) VALUES (?, ?, ?, ?, ?)`,
        [newCategoryId, categoriesName.trim(), officerID, parentCategoriesID || newCategoryId, categoriesPDF || null]
      );
    } catch (err) {
      // Defensive retry: if FK to Officers fails, retry with OfficerID=null
      if ((err && err.code === 'ER_NO_REFERENCED_ROW_2') || (err && String(err.message || '').toLowerCase().includes('foreign key'))) {
        console.warn(`[categoriesCrud] FK error inserting category ${newCategoryId} with OfficerID=${officerID}: ${err.message}. Retrying with OfficerID=null`);
        await connection.query(
          `INSERT INTO Categories (CategoriesID, CategoriesName, OfficerID, ParentCategoriesID, CategoriesPDF) VALUES (?, ?, ?, ?, ?)`,
          [newCategoryId, categoriesName.trim(), null, parentCategoriesID || newCategoryId, categoriesPDF || null]
        );
      } else {
        throw err;
      }
    }

    // Also store Contact if provided
    if (req.body && typeof req.body.contact !== 'undefined') {
      const contactVal = req.body.contact && String(req.body.contact).trim() ? String(req.body.contact).trim() : null;
      // delete any existing contact rows just in case
      await connection.query('DELETE FROM Categories_Contact WHERE CategoriesID = ?', [newCategoryId]);
      if (contactVal) {
        await connection.query('INSERT INTO Categories_Contact (CategoriesID, Contact) VALUES (?, ?)', [newCategoryId, contactVal]);
        console.log('[categoriesCrud] inserted Contact for new category', newCategoryId, contactVal && contactVal.slice(0,100));
      }
    }

    // Notify WebSocket clients
    if (req.app.locals.notifyCategoriesUpdate) {
      req.app.locals.notifyCategoriesUpdate({ action: 'create', id: newCategoryId });
    }

    // Try to regenerate canonical categories CSV and return latestPath
    try {
      const writeCategoriesCSV = require('../services/Categories/writeCategoriesCSV');
      const uploaderId = req.user?.userId || 1001;
      const { latestPath } = await writeCategoriesCSV(req.pool, uploaderId)();
      console.log(`✅ writeCategoriesCSV after create: wrote latestPath=${latestPath}`);
      res.status(201).json({ success: true, message: 'เพิ่มหมวดหมู่สำเร็จ', data: { id: newCategoryId, name: categoriesName.trim() }, latestPath });
    } catch (err) {
      console.error('writeCategoriesCSV after create failed:', err && (err.stack || err.message || err));
      // Fire-and-forget background attempt
      setImmediate(() => {
        (async () => {
          try {
            const mysql = require('mysql2/promise');
            const pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
            await require('../services/Categories/writeCategoriesCSV')(pool)();
            await pool.end();
            console.log('✅ background writeCategoriesCSV after create succeeded');
          } catch (bgErr) {
            console.error('❌ background writeCategoriesCSV after create failed:', bgErr && (bgErr.stack || bgErr.message || bgErr));
          }
        })();
      });

      res.status(201).json({ success: true, message: 'เพิ่มหมวดหมู่สำเร็จ', data: { id: newCategoryId, name: categoriesName.trim() }, latestPath: null });
    }

  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * PUT /categories/update/:id
 * แก้ไขหมวดหมู่
 */
router.put('/update/:id', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const categoryId = req.params.id; // Keep as string since CategoriesID is varchar
  const { categoriesName, parentCategoriesID, categoriesPDF } = req.body;

  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'Invalid Category ID' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if category exists
    const [existingCategory] = await connection.query(
      'SELECT CategoriesID, ParentCategoriesID FROM Categories WHERE CategoriesID = ?',
      [categoryId]
    );

    if (existingCategory.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบหมวดหมู่ที่ต้องการแก้ไข' });
    }

    // Get current officer info for duplicate checking
    let officerID = req.user?.userId ?? req.user?.OfficerID ?? null;
    let currentOfficerOrgID = null;
    if (officerID !== null) {
      const [foundOfficer] = await connection.query('SELECT OfficerID, OrgID FROM Officers WHERE OfficerID = ? LIMIT 1', [officerID]);
      if (foundOfficer && foundOfficer.length > 0) {
        currentOfficerOrgID = foundOfficer[0].OrgID;
      }
    }

    // Determine if this will be a sub-category after update
    const willBeSubCategory = parentCategoriesID !== undefined ? parentCategoriesID : existingCategory[0].ParentCategoriesID;
    const newName = categoriesName !== undefined ? categoriesName.trim() : null;

    // For sub-categories: check duplicate name within same parent (excluding self)
    const parentId = willBeSubCategory || (parentCategoriesID !== undefined ? parentCategoriesID : existingCategory[0].ParentCategoriesID);
    if (parentId && newName) {
      const [duplicateCheck] = await connection.query(`
        SELECT c.CategoriesID, c.OfficerID, o.OrgID 
        FROM Categories c 
        LEFT JOIN Officers o ON c.OfficerID = o.OfficerID
        WHERE c.CategoriesName = ? 
          AND c.ParentCategoriesID = ?
          AND c.CategoriesID != ?
      `, [newName, parentId, categoryId]);

      if (duplicateCheck.length > 0) {
        // Check if any duplicate shares same officer OR same organization
        for (const dup of duplicateCheck) {
          // Same officer (including NULL)
          if (dup.OfficerID === officerID) {
            return res.status(400).json({ success: false, message: 'ข้อมูลซ้ำ - ชื่อหมวดหมู่ย่อยนี้มีอยู่แล้วสำหรับเจ้าหน้าที่คนนี้' });
          }
          // Same organization
          if (currentOfficerOrgID && dup.OrgID === currentOfficerOrgID) {
            return res.status(400).json({ success: false, message: 'ข้อมูลซ้ำ - ชื่อหมวดหมู่ย่อยนี้มีอยู่แล้วในหน่วยงานเดียวกัน' });
          }
        }
      }
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];

    if (categoriesName !== undefined) {
      updateFields.push('CategoriesName = ?');
      updateValues.push(categoriesName.trim());
    }
    // Always allow parentCategoriesID update (can be null to make it a main category)
    if (parentCategoriesID !== undefined) {
      updateFields.push('ParentCategoriesID = ?');
      updateValues.push(parentCategoriesID || null);
    }
    if (categoriesPDF !== undefined) {
      updateFields.push('CategoriesPDF = ?');
      updateValues.push(categoriesPDF?.trim() || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });
    }

    updateValues.push(categoryId);

    await connection.query(
      `UPDATE Categories SET ${updateFields.join(', ')} WHERE CategoriesID = ?`,
      updateValues
    );

    // If changing to main category (no parent), set ParentCategoriesID to itself
    if (parentCategoriesID !== undefined && !parentCategoriesID) {
      await connection.query(
        'UPDATE Categories SET ParentCategoriesID = ? WHERE CategoriesID = ?',
        [categoryId, categoryId]
      );
    }

    // Update Contact in Categories_Contact if provided
    if (req.body && typeof req.body.contact !== 'undefined') {
      const contactVal = req.body.contact && String(req.body.contact).trim() ? String(req.body.contact).trim() : null;
      // delete existing contact rows for this category
      await connection.query('DELETE FROM Categories_Contact WHERE CategoriesID = ?', [categoryId]);
      if (contactVal) {
        await connection.query('INSERT INTO Categories_Contact (CategoriesID, Contact) VALUES (?, ?)', [categoryId, contactVal]);
        console.log('[categoriesCrud] updated Contact for category', categoryId, contactVal && contactVal.slice(0,100));
      }
    }

    // Notify WebSocket clients
    if (req.app.locals.notifyCategoriesUpdate) {
      req.app.locals.notifyCategoriesUpdate({ action: 'update', id: categoryId });
    }

    // Try to regenerate categories CSV and return latestPath
    try {
      const writeCategoriesCSV = require('../services/Categories/writeCategoriesCSV');
      const uploaderId = req.user?.userId || 1001;
      const { latestPath } = await writeCategoriesCSV(req.pool, uploaderId)();
      console.log(`✅ writeCategoriesCSV after update: wrote latestPath=${latestPath}`);
      res.status(200).json({ success: true, message: 'แก้ไขหมวดหมู่สำเร็จ', data: { id: categoryId }, latestPath });
    } catch (err) {
      console.error('writeCategoriesCSV after update failed:', err && (err.stack || err.message || err));
      // background attempt
      setImmediate(() => {
        (async () => {
          try {
            const mysql = require('mysql2/promise');
            const pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
            await require('../services/Categories/writeCategoriesCSV')(pool)();
            await pool.end();
            console.log('✅ background writeCategoriesCSV after update succeeded');
          } catch (bgErr) {
            console.error('❌ background writeCategoriesCSV after update failed:', bgErr && (bgErr.stack || bgErr.message || bgErr));
          }
        })();
      });

      res.status(200).json({ success: true, message: 'แก้ไขหมวดหมู่สำเร็จ', data: { id: categoryId }, latestPath: null });
    }

  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * DELETE /categories/delete/:id
 * ลบหมวดหมู่
 */
router.delete('/delete/:id', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const categoryId = req.params.id; // Keep as string since CategoriesID is varchar

  console.log(`[categoriesCrud] DELETE request for id=${categoryId}, user=${JSON.stringify(req.user ? { userId: req.user.userId, usertype: req.user.usertype } : null)}`);

  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'Invalid Category ID' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Check if category or its subcategories have associated QuestionsAnswers
    const [qaCount] = await connection.query(
      'SELECT COUNT(*) AS count FROM QuestionsAnswers WHERE CategoriesID = ? OR CategoriesID LIKE ?',
      [categoryId, `${categoryId}-%`]
    );

    console.log(`[categoriesCrud] qaCount for id=${categoryId} => ${qaCount && qaCount[0] ? qaCount[0].count : 'unknown'}`);

    if (qaCount[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากมีคำถาม-คำตอบ ${qaCount[0].count} รายการอยู่ในหมวดหมู่หลักหรือย่อยนี้`,
        qaCount: qaCount[0].count
      });
    }

    // Delete contacts for subcategories
    await connection.query('DELETE FROM Categories_Contact WHERE CategoriesID LIKE ?', [`${categoryId}-%`]);

    // Delete subcategories
    await connection.query('DELETE FROM Categories WHERE ParentCategoriesID = ?', [categoryId]);

    // Delete contacts for main category
    await connection.query('DELETE FROM Categories_Contact WHERE CategoriesID = ?', [categoryId]);

    // Delete the category
    const [result] = await connection.query(
      'DELETE FROM Categories WHERE CategoriesID = ?',
      [categoryId]
    );

    console.log(`[categoriesCrud] DELETE query affectedRows for id=${categoryId} => ${result && typeof result.affectedRows !== 'undefined' ? result.affectedRows : JSON.stringify(result)}`);

    if (result.affectedRows === 0) {
      console.warn(`[categoriesCrud] Category id=${categoryId} not found; treating DELETE as idempotent success`);
      // Refresh clients so frontend list stays consistent
      if (req.app.locals.notifyCategoriesUpdate) {
        req.app.locals.notifyCategoriesUpdate({ action: 'delete', id: categoryId });
      }
      return res.status(200).json({ success: true, message: 'ไม่พบหมวดหมู่ที่ต้องการลบ (ถือว่าเรียบร้อยแล้ว)', data: { id: categoryId, alreadyRemoved: true } });
    }

    // Notify WebSocket clients
    if (req.app.locals.notifyCategoriesUpdate) {
      req.app.locals.notifyCategoriesUpdate({ action: 'delete', id: categoryId });
    }

    // Try to regenerate categories CSV and return latestPath
    try {
      const writeCategoriesCSV = require('../services/Categories/writeCategoriesCSV');
      const uploaderId = req.user?.userId || 1001;
      const { latestPath } = await writeCategoriesCSV(req.pool, uploaderId)();
      console.log(`✅ writeCategoriesCSV after delete: wrote latestPath=${latestPath}`);
      res.status(200).json({ success: true, message: 'ลบหมวดหมู่สำเร็จ', data: { id: categoryId }, latestPath });
    } catch (err) {
      console.error('writeCategoriesCSV after delete failed:', err && (err.stack || err.message || err));
      // background attempt
      setImmediate(() => {
        (async () => {
          try {
            const mysql = require('mysql2/promise');
            const pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
            await require('../services/Categories/writeCategoriesCSV')(pool)();
            await pool.end();
            console.log('✅ background writeCategoriesCSV after delete succeeded');
          } catch (bgErr) {
            console.error('❌ background writeCategoriesCSV after delete failed:', bgErr && (bgErr.stack || bgErr.message || bgErr));
          }
        })();
      });

      res.status(200).json({ success: true, message: 'ลบหมวดหมู่สำเร็จ', data: { id: categoryId }, latestPath: null });
    }

  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /categories/single/:id
 * ดึงข้อมูลหมวดหมู่เดี่ยว
 */
router.get('/single/:id', async (req, res) => {
  const pool = req.pool;
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Database pool not available' });
  }

  const categoryId = req.params.id; // Keep as string since CategoriesID is varchar

  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'Invalid Category ID' });
  }

  try {
    // Get category
    const [category] = await pool.query(
      `SELECT c.CategoriesID, c.CategoriesName, c.CategoriesDetail, c.ParentCategoriesID, c.CategoriesPDF,
              (SELECT GROUP_CONCAT(Contact SEPARATOR ' ||| ') FROM Categories_Contact cc WHERE cc.CategoriesID = c.CategoriesID) AS Contact,
              COUNT(qa.QuestionsAnswersID) AS qaCount
       FROM Categories c
       LEFT JOIN QuestionsAnswers qa ON c.CategoriesID = qa.CategoriesID
       WHERE c.CategoriesID = ?
       GROUP BY c.CategoriesID, c.CategoriesName, c.CategoriesDetail, c.ParentCategoriesID, c.CategoriesPDF`,
      [categoryId]
    );

    if (category.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบหมวดหมู่' });
    }

    res.status(200).json({
      success: true,
      data: category[0]
    });

  } catch (err) {
    console.error('Get single category error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /categories/template
 * ดาวน์โหลดไฟล์ template CSV สำหรับอัพโหลดหมวดหมู่
 */
router.get('/template', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  try {
    const headers = 'CategoriesName,ParentCategoriesName,CategoriesPDF,Contact';
    
    // Create template directory if it doesn't exist
    const templateDir = path.join(__dirname, '..', 'files', 'managecategories', 'templates');
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    // Create template file
    const templatePath = path.join(templateDir, 'categories_template.csv');
    fs.writeFileSync(templatePath, headers, 'utf8');

    // Send file as download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="categories_template.csv"');
    res.status(200).send(headers);
  } catch (err) {
    console.error('Template generation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
