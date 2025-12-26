/**
 * AI Image Management Routes
 * Handles uploading, retrieving, and managing AI assistant images
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '..', 'uploads', 'ai-images');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Store metadata in a JSON file
const metadataFile = path.join(uploadDir, 'metadata.json');

function loadMetadata() {
  try {
    if (fs.existsSync(metadataFile)) {
      return JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading AI image metadata:', err);
  }
  return { active: null, images: [] };
}

function saveMetadata(data) {
  try {
    fs.writeFileSync(metadataFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving AI image metadata:', err);
  }
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'ai-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, WebP, GIF)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

/**
 * GET /ai-image
 * Get current active image and history
 */
router.get('/', (req, res) => {
  try {
    const metadata = loadMetadata();
    
    // Build response with full URLs
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    let active = null;
    if (metadata.active) {
      const activeImg = metadata.images.find(img => img.id === metadata.active);
      if (activeImg) {
        active = {
          ...activeImg,
          url: `${baseUrl}/uploads/ai-images/${activeImg.filename}`
        };
      }
    }
    
    const history = metadata.images.map(img => ({
      ...img,
      url: `${baseUrl}/uploads/ai-images/${img.filename}`,
      isActive: img.id === metadata.active
    })).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    res.json({ active, history });
  } catch (err) {
    console.error('Error getting AI images:', err);
    res.status(500).json({ message: 'Failed to get AI images' });
  }
});

/**
 * POST /ai-image/upload
 * Upload a new AI image
 */
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }
    
    const metadata = loadMetadata();
    
    // Create new image entry
    const newImage = {
      id: Date.now().toString(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString()
    };
    
    // Add to images array
    metadata.images.push(newImage);
    
    // DO NOT set as active automatically - require explicit user action
    // Only set as active if there's no active image at all (first image ever)
    if (!metadata.active && metadata.images.length === 1) {
      metadata.active = newImage.id;
    }
    
    saveMetadata(metadata);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      message: 'Image uploaded successfully',
      image: {
        ...newImage,
        url: `${baseUrl}/uploads/ai-images/${newImage.filename}`
      },
      imageUrl: `${baseUrl}/uploads/ai-images/${newImage.filename}`
    });
  } catch (err) {
    console.error('Error uploading AI image:', err);
    res.status(500).json({ message: 'Failed to upload image' });
  }
});

/**
 * POST /ai-image/set-active
 * Set an image as the active AI image
 */
router.post('/set-active', (req, res) => {
  try {
    const { imageId } = req.body;
    
    if (!imageId) {
      return res.status(400).json({ message: 'Image ID is required' });
    }
    
    const metadata = loadMetadata();
    
    // Check if image exists
    const image = metadata.images.find(img => img.id === imageId);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Set as active
    metadata.active = imageId;
    saveMetadata(metadata);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      message: 'Active image updated successfully',
      active: {
        ...image,
        url: `${baseUrl}/uploads/ai-images/${image.filename}`
      }
    });
  } catch (err) {
    console.error('Error setting active AI image:', err);
    res.status(500).json({ message: 'Failed to set active image' });
  }
});

/**
 * DELETE /ai-image/:id
 * Delete an AI image
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const metadata = loadMetadata();
    
    // Find image
    const imageIndex = metadata.images.findIndex(img => img.id === id);
    if (imageIndex === -1) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    const image = metadata.images[imageIndex];
    
    // Don't allow deleting the only remaining image
    if (metadata.images.length === 1) {
      return res.status(400).json({ message: 'Cannot delete the only remaining image' });
    }
    
    // Delete file
    const filePath = path.join(uploadDir, image.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Remove from metadata
    metadata.images.splice(imageIndex, 1);
    
    // If deleted image was active, set another one as active
    if (metadata.active === id) {
      if (metadata.images.length > 0) {
        metadata.active = metadata.images[0].id;
      } else {
        metadata.active = null;
      }
    }
    
    saveMetadata(metadata);
    
    res.json({ message: 'Image deleted successfully' });
  } catch (err) {
    console.error('Error deleting AI image:', err);
    res.status(500).json({ message: 'Failed to delete image' });
  }
});

/**
 * GET /ai-image/active
 * Get only the currently active AI image (for public use in chatbot)
 */
router.get('/active', (req, res) => {
  try {
    const metadata = loadMetadata();
    
    if (!metadata.active) {
      return res.status(404).json({ message: 'No active AI image set' });
    }
    
    const activeImg = metadata.images.find(img => img.id === metadata.active);
    if (!activeImg) {
      return res.status(404).json({ message: 'Active AI image not found' });
    }
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      url: `${baseUrl}/uploads/ai-images/${activeImg.filename}`,
      name: activeImg.name,
      id: activeImg.id
    });
  } catch (err) {
    console.error('Error getting active AI image:', err);
    res.status(500).json({ message: 'Failed to get active image' });
  }
});

// Get bot name
router.get('/bot-name', (req, res) => {
  try {
    const metadata = loadMetadata();
    res.json({
      botName: metadata.botName || 'ปลายฟ้า'
    });
  } catch (err) {
    console.error('Error getting bot name:', err);
    res.status(500).json({ message: 'Failed to get bot name' });
  }
});

// Update bot name
router.put('/bot-name', (req, res) => {
  try {
    const { botName } = req.body;
    
    if (!botName || botName.trim() === '') {
      return res.status(400).json({ message: 'Bot name cannot be empty' });
    }
    
    const metadata = loadMetadata();
    metadata.botName = botName.trim();
    saveMetadata(metadata);
    
    res.json({
      message: 'Bot name updated successfully',
      botName: metadata.botName
    });
  } catch (err) {
    console.error('Error updating bot name:', err);
    res.status(500).json({ message: 'Failed to update bot name' });
  }
});

/**
 * GET /ai-image/bot-pronoun
 * Get bot pronoun
 */
router.get('/bot-pronoun', (req, res) => {
  try {
    const metadata = loadMetadata();
    res.json({
      pronoun: metadata.botPronoun || 'หนู' // Default to 'หนู'
    });
  } catch (err) {
    console.error('Error getting bot pronoun:', err);
    res.status(500).json({ message: 'Failed to get bot pronoun' });
  }
});

/**
 * POST /ai-image/bot-pronoun
 * Update bot pronoun
 */
router.post('/bot-pronoun', (req, res) => {
  try {
    const { pronoun } = req.body;
    
    if (!pronoun || pronoun.trim() === '') {
      return res.status(400).json({ message: 'Pronoun cannot be empty' });
    }
    
    const metadata = loadMetadata();
    metadata.botPronoun = pronoun.trim();
    saveMetadata(metadata);
    
    res.json({
      message: 'Bot pronoun updated successfully',
      pronoun: metadata.botPronoun
    });
  } catch (err) {
    console.error('Error updating bot pronoun:', err);
    res.status(500).json({ message: 'Failed to update bot pronoun' });
  }
});

module.exports = router;
