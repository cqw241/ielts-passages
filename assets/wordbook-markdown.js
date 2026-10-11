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
  function text(value) {
    if (!md) return String(value ?? '');
    // Use parser tokens, not rendered HTML: retain link labels and code contents,
    // omit formatting/URLs, and separate blocks before whitespace normalisation.
    const content = tokens => tokens.map(token => token.children ? content(token.children)
      : ['text', 'code_inline'].includes(token.type) ? token.content
      : ['softbreak', 'hardbreak'].includes(token.type) || token.block && token.nesting === -1 ? '\n' : '').join('');
    return content(md.parse(String(value ?? ''), {})).replace(/\n{3,}/g, '\n\n').trim();
  }
  function isPersonalDefinition(entry) {
    if (entry.kind === 'sentence') return true;
    if (typeof entry.edited?.definitionMarkdown === 'boolean') return entry.edited.definitionMarkdown;
    // Existing personal definitions need no migration; dictionary choices stay plain.
    return !!entry.edited?.definition && !entry.candidates.some(c => c.definition === entry.definition);
  }
  const definition = entry => isPersonalDefinition(entry) ? render(entry.definition) : esc(entry.definition);
  const definitionText = entry => isPersonalDefinition(entry) ? text(entry.definition) : String(entry.definition ?? '');
  window.WordbookMarkdown = {render, text, definition, definitionText, isPersonalDefinition};
})();
