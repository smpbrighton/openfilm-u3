import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookup } from '../chat/src/i18n/lookup.ts';
import { enUS } from '../chat/src/i18n/locales/en-US.ts';
import { es } from '../chat/src/i18n/locales/es.ts';
import { ja } from '../chat/src/i18n/locales/ja.ts';
import { ko } from '../chat/src/i18n/locales/ko.ts';
import { zhCN } from '../chat/src/i18n/locales/zh-CN.ts';

test('chat translation renames product words while preserving CLI names and paths', () => {
  const dict = { studio: 'OpenFilm Studio', product: 'OpenFilm', cli: 'openfilm open ~/.openfilm OPENFILM_HOME ~/Movies/OpenFilm/Projects' };
  assert.equal(lookup(dict, 'studio'), 'u3 Studio');
  assert.equal(lookup(dict, 'product'), 'u3 Studio');
  assert.equal(lookup(dict, 'cli'), dict.cli);
  assert.equal(lookup(dict, 'missing.OpenFilm'), 'missing.OpenFilm');
  assert.equal(dict.studio, 'OpenFilm Studio', 'the source dictionary is unchanged');
});

test('all five chat languages display the new product name', () => {
  for (const [language, dict] of Object.entries({ enUS, es, ja, ko, zhCN })) {
    const visit = (value, prefix = '') => {
      for (const [key, word] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof word === 'object' && word) visit(word, path);
        else if (typeof word === 'string' && word.includes('OpenFilm')) {
          assert.ok(lookup(dict, path).includes('u3 Studio'), `${language}: ${path}`);
          assert.ok(!lookup(dict, path).includes('OpenFilm'), `${language}: ${path}`);
        }
      }
    };
    visit(dict);
  }
});
