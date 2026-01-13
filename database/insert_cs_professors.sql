-- ข้อมูลอาจารย์สาขาวิทยาการคอมพิวเตอร์ (Computer Science) คณะวิทยาศาสตร์และเทคโนโลยี PCRU
-- วันที่: 14 มกราคม 2569

-- 1. ผศ.ทัสนันทน์ ตรีนันทรัตน์
INSERT INTO QuestionsAnswers (QuestionTitle, QuestionText, CategoriesID, OfficerID) 
VALUES (
    'อาจารย์สาขาวิทยาการคอมพิวเตอร์ CS PCRU',
    'รายชื่ออาจารย์ประจำหลักสูตร วิทยาการคอมพิวเตอร์ (Computer Science) หรือ "วิทย์คอม" คณะวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยราชภัฏเพชรบูรณ์ (PCRU) มีรายนามอาจารย์ที่สำคัญดังนี้ค่ะ

👨‍🏫 **อาจารย์ประจำหลักสูตรวิทยาการคอมพิวเตอร์ (คณะวิทยาศาสตร์ฯ)**

อาจารย์ในกลุ่มนี้จะดูแลหลักสูตร วิทยาศาสตรบัณฑิต (วท.บ.) เป็นหลักค่ะ:

**1. ผศ.ทัสนันทน์ ตรีนันทรัตน์** (Asst. Prof. Tassanan Treenuntharath)
   - ความเชี่ยวชาญ: Ontology, Machine Learning, Data Mining

**2. ผศ.เขมปริต ขุนราชเสนา** (Asst. Prof. Kheamparit Khunratchasana)
   - ความเชี่ยวชาญ: AI, Image Processing

**3. อาจารย์จิตรนันท์ ศรีเจริญ** (Ajarn Jitranun Sricharoen)
   - ความเชี่ยวชาญ: Information Technology, Data Science
   - ปัจจุบันมีบทบาทบริหารในสำนักส่งเสริมวิชาการฯ ด้วย

**4. อาจารย์ดวงจันทร์ สีหาราช** (Ajarn Duangchan Siharaj)
   - ดูแลรายวิชาพื้นฐานและงานวิจัยที่เกี่ยวข้องกับท้องถิ่น

⚠️ **ข้อสังเกต:** อาจมีอาจารย์พิเศษหรืออาจารย์จากสาขาใกล้เคียง เช่น เทคโนโลยีสารสนเทศ (IT) มาร่วมสอนในบางรายวิชาด้วย เช่น ผศ.ดร.เดือนฉาย ไชยบุตร (ซึ่งเชี่ยวชาญด้าน IT และการบริหารการศึกษา)

⚠️ **ระวังความสับสน (ต่างสาขา/ต่างคณะ)**

บางครั้งนักศึกษาอาจสับสนระหว่าง "วิทย์คอม" กับสาขาคอมพิวเตอร์อื่น ๆ ถ้าหมายถึงสาขาอื่น อาจารย์จะเป็นคนละชุดกันค่ะ:

- **คอมพิวเตอร์ธุรกิจ (Business Computer):** สังกัด คณะวิทยาการจัดการ (เช่น ผศ.ศุภรัตน์ แก้วเสริม, อาจารย์วิมลวรรณ วงค์ศิริ)
- **เทคโนโลยีคอมพิวเตอร์ (Computer Technology):** สังกัด คณะเทคโนโลยีการเกษตรและเทคโนโลยีอุตสาหกรรม (เน้น Hardware/อิเล็กทรอนิกส์)

📞 **ต้องการติดต่ออาจารย์ท่านไหนเป็นพิเศษไหมคะ?**

หากต้องการอีเมล เบอร์โทรภายใน หรือหัวข้องานวิจัยของอาจารย์ท่านใดเพื่อเข้าไปปรึกษา (เช่น ทำโปรเจกต์จบ) บอกหนูได้เลยนะคะ หนูจะช่วยหาข้อมูลเจาะจงให้ค่ะ 😊',
    (SELECT CategoriesID FROM Categories WHERE CategoriesName LIKE '%วิทยาศาสตร์%' LIMIT 1),
    NULL
);

-- เพิ่ม Keywords สำหรับการค้นหา
SET @qa_id = LAST_INSERT_ID();

INSERT INTO Keywords (KeywordText) VALUES ('อาจารย์สาขา cs') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('อาจารย์วิทยาการคอมพิวเตอร์') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('อาจารย์วิทย์คอม') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('computer science pcru') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('ทัสนันทน์') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('เขมปริต') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('จิตรนันท์') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('ดวงจันทร์') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('อาจารย์ cs') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('รายชื่ออาจารย์ cs') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('cs มีอาจารย์') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());

INSERT INTO Keywords (KeywordText) VALUES ('วิทย์คอมมีอาจารย์') ON DUPLICATE KEY UPDATE KeywordID=LAST_INSERT_ID(KeywordID);
INSERT INTO AnswersKeywords (QuestionsAnswersID, KeywordID) VALUES (@qa_id, LAST_INSERT_ID());
