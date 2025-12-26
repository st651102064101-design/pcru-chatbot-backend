-- Migration: drop ConfidenceAdjustments table
-- Run this after taking a backup (see backup_confidence_adjustments.sh)

DROP TABLE IF EXISTS ConfidenceAdjustments;

-- Optionally remove associated indexes or dependent objects if any
