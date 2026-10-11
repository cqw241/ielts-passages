/* Markdown is confined to learner-authored meanings and notes. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const md = window.markdownit?.('commonmark', {html:false, breaks:true});
  if (md) {
    // Keep the small notes format; in particular, never load user-supplied images.
    md.disable(['image', 'heading', 'lheading', 'fence', 'code', 'hr']);
    const validate = md.validateLink.bind(md);
    md.validateLink = url => {
      if (!validate(url)) return false;
      try { return ['http:', 'https:', 'mailto:'].includes(new URL(url, location.href).protocol); }
      catch { return false; }
    };
  }
  function render(value) {
    // Retain safe plain-text output if the parser file cannot load.
    return md ? md.render(String(value ?? '')) : esc(value).replace(/\n/g, '<br>');
  }
  function isPersonalDefinition(entry) {
    if (entry.kind === 'sentence') return true;
    if (typeof entry.edited?.definitionMarkdown === 'boolean') return entry.edited.definitionMarkdown;
    // Existing personal definitions need no migration; dictionary choices stay plain.
    return !!entry.edited?.definition && !entry.candidates.some(c => c.definition === entry.definition);
  }
  const definition = entry => isPersonalDefinition(entry) ? render(entry.definition) : esc(entry.definition);
  window.WordbookMarkdown = {render, definition, isPersonalDefinition};
})();
