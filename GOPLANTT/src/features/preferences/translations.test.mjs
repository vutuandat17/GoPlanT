import assert from 'node:assert/strict';
import test from 'node:test';

import { translateText } from './translations.ts';

test('returns original Vietnamese text when language is vi', () => {
  assert.equal(translateText('Chào buổi sáng, An 🌱', 'vi'), 'Chào buổi sáng, An 🌱');
  assert.equal(translateText('Đang tải dữ liệu…', 'vi'), 'Đang tải dữ liệu…');
});

test('translates time-based greetings and subtitles to English', () => {
  assert.equal(translateText('Chào buổi sáng, An 🌱', 'en'), 'Good morning, An 🌱');
  assert.equal(translateText('Chào buổi trưa, An ☀️', 'en'), 'Good afternoon, An ☀️');
  assert.equal(translateText('Chào buổi chiều, An 🌤️', 'en'), 'Good afternoon, An 🌤️');
  assert.equal(translateText('Chào buổi tối, An 🌙', 'en'), 'Good evening, An 🌙');
  assert.equal(
    translateText('Cùng nhìn lại tình trạng khu vườn sau một ngày nhé!', 'en'),
    'Let’s review your garden’s condition after the day!',
  );
});

test('translates dynamic count and upload network messages', () => {
  assert.equal(translateText('1 khu vực', 'en'), '1 area');
  assert.equal(translateText('3 khu vực', 'en'), '3 areas');
  assert.equal(translateText('Ban công (2)', 'en'), 'Balcony (2)');
});
