-- Sandbox test ground (sandbox Worker only, never production). Safe to run on every deploy:
-- everything is INSERT OR IGNORE. Owner login: phone 9847012345, PIN 1234.
INSERT OR IGNORE INTO grounds (slug, name, area, maps_url, upi_id, upi_name, whatsapp, facilities, open_hour, close_hour, created_at)
   VALUES ('sandbox', 'GoArena Sandbox', 'Bangalore', '', 'sandbox@ybl', 'GoArena Sandbox',
           '9847012345', '["Floodlights","Parking","Indoor badminton hall"]',
           6, 24, 1794224765323);
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'FULL', 'Full ground', '8-a-side', 3, 0);
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'HALF_A', 'Half A', '5-a-side', 1, 1);
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'HALF_B', 'Half B', '5-a-side', 2, 2);
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 1200 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'FULL';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 1500 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'FULL';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 700 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'HALF_A';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 900 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'HALF_A';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 700 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'HALF_B';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 900 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'HALF_B';
INSERT OR IGNORE INTO staff (ground_id, role, name, phone, pin_hash, created_at) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'owner', 'Test Owner', '9847012345', 'pbkdf2$100000$rbQGOOn/5NKNIxP0jXA/VQ==$0cJ8ZN1PmyuHSU7MXDQm4VhdN0SeEwRuT2jFtnbGx6k=', 1794224765323);

-- Multi-sport: box cricket on the same turf (same cells), 3 indoor badminton courts.
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort, sport) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'CR_FULL', 'Full ground', 'Full turf', 3, 0, 'cricket');
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 1200 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'CR_FULL';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 1500 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'CR_FULL';
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort, sport) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'CR_HALF_A', 'Half A', 'Half turf', 1, 1, 'cricket');
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 700 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'CR_HALF_A';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 900 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'CR_HALF_A';
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort, sport) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'CR_HALF_B', 'Half B', 'Half turf', 2, 2, 'cricket');
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 700 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'CR_HALF_B';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 900 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'CR_HALF_B';
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort, sport) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'BAD_1', 'Court 1', 'Indoor', 16, 1, 'badminton');
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 400 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'BAD_1';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 500 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'BAD_1';
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort, sport) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'BAD_2', 'Court 2', 'Indoor', 32, 2, 'badminton');
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 400 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'BAD_2';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 500 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'BAD_2';
INSERT OR IGNORE INTO units (ground_id, code, name, subtitle, mask, sort, sport) VALUES ((SELECT id FROM grounds WHERE slug = 'sandbox'), 'BAD_3', 'Court 3', 'Indoor', 64, 3, 'badminton');
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', 400 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'BAD_3';
INSERT OR IGNORE INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', 500 FROM units WHERE ground_id = (SELECT id FROM grounds WHERE slug = 'sandbox') AND code = 'BAD_3';
