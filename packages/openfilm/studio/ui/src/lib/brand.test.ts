import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, lookup, useT } from '../i18n/index.ts';
import { en } from '../i18n/en.ts';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

test('Studio t() renames product words and preserves commands, paths and identifiers', () => {
  const words = en as unknown as Record<string, unknown>;
  words.u3BrandTest = {
    studio: 'OpenFilm Studio', product: 'OpenFilm',
    mixed: 'OpenFilm: openfilm open; ~/.openfilm; OPENFILM_HOME; ~/Movies/OpenFilm/Projects',
    boundary: "OpenFilming OpenFilm's OpenFilm.",
  };
  try {
    function Label() { return useT()('u3BrandTest.studio'); }
    assert.equal(renderToStaticMarkup(React.createElement(Label)), 'u3 Studio');
    assert.equal(lookup('u3BrandTest.product', 'en'), 'u3 Studio');
    assert.equal(lookup('u3BrandTest.mixed', 'en'), 'u3 Studio: openfilm open; ~/.openfilm; OPENFILM_HOME; ~/Movies/OpenFilm/Projects');
    assert.equal(lookup('u3BrandTest.boundary', 'en'), "OpenFilming u3 Studio's u3 Studio.");
    assert.equal(lookup('u3BrandTest.studio', 'ko'), 'u3 Studio', 'English fallback is branded too');
    assert.equal(lookup('missing.OpenFilm', 'en'), 'missing.OpenFilm', 'unknown keys remain keys');
    assert.equal(words.u3BrandTest && (words.u3BrandTest as Record<string, string>).studio, 'OpenFilm Studio');
  } finally { delete words.u3BrandTest; }
});

test('all five Studio languages display the new name and keep the CLI command', () => {
  for (const { code } of LANGUAGES) {
    assert.ok(lookup('settings.appearance.languageHint', code).includes('u3 Studio'), code);
    assert.ok(!lookup('settings.appearance.languageHint', code).includes('OpenFilm'), code);
    assert.ok(lookup('connection.lockedBody', code).includes('openfilm open'), code);
  }
});
