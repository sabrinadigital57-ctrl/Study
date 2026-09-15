const course = document.getElementById('course');
const charCount = document.getElementById('charCount');
const resultCard = document.getElementById('resultCard');
const resultContent = document.getElementById('resultContent');
const resultTitle = document.getElementById('resultTitle');
const resultSubject = document.getElementById('resultSubject');

course.addEventListener('input', () => {
  const count = course.value.length;
  charCount.textContent = `${count} caractère${count > 1 ? 's' : ''}`;
});

document.getElementById('generateBtn').addEventListener('click', generateSheet);
course.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') generateSheet();
});

document.getElementById('clearBtn').addEventListener('click', () => {
  resultCard.classList.add('hidden');
  course.focus();
});

document.getElementById('printBtn').addEventListener('click', () => window.print());

document.getElementById('copyBtn').addEventListener('click', async () => {
  const text = buildPlainText();
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('copyBtn').textContent = 'Copié ✓';
    setTimeout(() => document.getElementById('copyBtn').textContent = 'Copier', 1500);
  } catch {
    alert('La copie automatique n’a pas fonctionné. Tu peux sélectionner le texte de la fiche.');
  }
});

function generateSheet() {
  const text = course.value.trim();
  if (!text) {
    course.focus();
    course.placeholder = 'Commence par coller ton cours ici ✦';
    return;
  }

  const subject = document.getElementById('subject').value;
  const format = document.getElementById('format').value;
  const structure = parseCourse(text);
  const { sentences, bullets, definitions, headings, questionGroups } = structure;
  const important = pickImportant(sentences, headings, bullets, questionGroups);
  const summary = makeSummary(sentences, format);

  resultTitle.textContent = `Fiche — ${headings[0] || subject}`;
  resultSubject.textContent = subject;

  let html = '';
  if (format === 'qa') {
    const qa = questionGroups.length ? questionGroups : makeFallbackQA(important);
    html += section('Questions / réponses', qa.map(group => `
      <div class="definition">
        <strong>${escapeHtml(group.question)}</strong>
        <ul>${group.answers.map(answer => `<li>${escapeHtml(answer)}</li>`).join('')}</ul>
      </div>
    `).join(''));
  } else if (format === 'definitions') {
    html += section('Notions essentielles', `<ul>${important.slice(0, 8).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    html += definitions.length ? section('Définitions', definitions.map(([term, def]) => `<div class="definition"><strong>${escapeHtml(term)}</strong> : ${escapeHtml(def)}</div>`).join('')) : section('Définitions', '<p>Aucune définition avec « : » n’a été repérée. Tu peux en ajouter dans ton cours pour les retrouver ici.</p>');
  } else {
    html += section('Résumé', `<p>${escapeHtml(summary)}</p>`);
    html += section('Notions importantes', `<ul>${important.slice(0, format === 'short' ? 5 : 9).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    if (definitions.length && format !== 'short') html += section('Définitions', definitions.slice(0, 8).map(([term, def]) => `<div class="definition"><strong>${escapeHtml(term)}</strong> : ${escapeHtml(def)}</div>`).join(''));
    html += section('Pour te tester', `<ul class="question-list">${makeQuestions(important).map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul>`);
  }

  resultContent.innerHTML = html;
  resultCard.classList.remove('hidden');
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function parseCourse(text) {
  const normalizedLines = normalizeCourse(text);
  const bullets = extractBullets(normalizedLines);
  const sentences = extractSentences(normalizedLines);
  const definitions = extractDefinitions(normalizedLines);
  const headings = extractHeadings(normalizedLines);
  const questionGroups = extractQuestionGroups(normalizedLines);
  return { lines: normalizedLines, sentences, bullets, definitions, headings, questionGroups };
}

// Les copier-coller depuis Word, Canva ou PDF peuvent supprimer les retours à la ligne.
// On reconstruit donc une structure minimale à partir des titres en gras/numérotés,
// des puces et des listes séparées par des « ; ».
function normalizeCourse(text) {
  let value = text.replace(/\r/g, '');

  // Un titre Markdown en gras devient une ligne autonome.
  value = value.replace(/\*\*\s*([^*\n]+?)\s*\*\*/g, '\n@@BOLD@@$1@@END@@\n');

  // Titres numérotés collés au texte : 1. Titre, 2. Titre, etc.
  value = value.replace(/\s+(?=(?:\d+[.)])\s+[A-ZÀ-ÖØ-Ý])/g, '\n');

  // Titres Markdown simples collés au texte.
  value = value.replace(/\s+(?=###?\s+)/g, '\n');

  // Les listes « - ... ; - ... » deviennent de vraies lignes.
  value = value.replace(/\s+(?=[-•▪]\s+)/g, '\n');

  // Certains copier-coller suppriment aussi les puces. On sépare alors
  // les éléments d’une liste quand ils sont clairement séparés par « ; ».
  value = value.replace(/;\s+(?=[a-zà-ÿ])/g, ';\n');

  return value
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function clean(value) {
  return value
    .replace(/^\s*@@BOLD@@/, '')
    .replace(/@@END@@\s*$/, '')
    .replace(/^\s*\*\*(.*?)\*\*\s*$/, '$1')
    .replace(/^\s*__([^_]+)__\s*$/, '$1')
    .replace(/^\s*#+\s*/, '')
    .replace(/^\s*[-•▪]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBullet(line) {
  return /^\s*(?:[-•*▪]|\d+[.)])\s+/.test(line);
}

function extractBullets(lines) {
  return lines
    .filter(isBullet)
    .map(line => clean(line))
    .filter(Boolean);
}

function extractHeadings(lines) {
  return lines
    .map(line => {
      const raw = line.trim();
      const value = clean(raw);
      return { raw, value };
    })
    .filter(item => isHeading(item.raw, item.value))
    .map(item => item.value.replace(/:$/, '').trim())
    .filter(item => item && !/^cours test\b/i.test(item));
}

function isHeading(rawLine, cleanedLine = clean(rawLine)) {
  const raw = rawLine.trim();
  const markdownHeading = /^#{1,4}\s/.test(raw);
  const numberedHeading = /^\d+[.)]\s+/.test(raw) && !isBullet(raw);
  const boldHeading = /^@@BOLD@@/.test(raw) || /^\*\*[^*]+\*\*$/.test(raw);
  const colonHeading = cleanedLine.endsWith(':') && cleanedLine.split(/\s+/).length <= 14 && !isListIntro(cleanedLine);
  const questionHeading = cleanedLine.endsWith('?') && cleanedLine.split(/\s+/).length <= 12;
  const knownHeading = /^(définition|pourquoi se laver les mains|les différents types d’hygiène des mains|quand réaliser une hygiène des mains|les étapes du lavage simple|à retenir)$/i.test(cleanedLine);
  return markdownHeading || numberedHeading || boldHeading || colonHeading || questionHeading || knownHeading;
}

function extractSentences(lines) {
  return lines
    .filter(line => !isBullet(line))
    .filter(line => !isHeading(line))
    .flatMap(line => line.replace(/\*\*/g, '').split(/(?<=[.!?])\s+/))
    .map(clean)
    .filter(sentence => sentence.length > 25)
    .filter(sentence => !isListIntro(sentence))
    .filter(sentence => !/^cours test\b/i.test(sentence))
    .filter(sentence => !/^mots importants\s*:/i.test(sentence));
}

function extractDefinitions(lines) {
  const definitions = [];

  for (const line of lines) {
    const value = clean(line);
    if (!value.includes(':')) continue;
    if (/^mots importants\s*:/i.test(value)) continue;

    const index = value.indexOf(':');
    const term = value.slice(0, index).trim();
    const def = value.slice(index + 1).trim();
    if (!term || !def || term.split(/\s+/).length > 10) continue;
    if (isListIntro(value) || /^cours test\b/i.test(term)) continue;

    // Une vraie définition peut être dans une puce : « - Le lavage simple : ... ».
    // On la garde, mais on ignore les phrases de liste comme « objectifs : ... ».
    definitions.push([term, def]);
  }

  return uniquePairs(definitions).slice(0, 10);
}

function extractQuestionGroups(lines) {
  const groups = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (isBullet(line)) {
      if (current) current.answers.push(clean(line));
      continue;
    }

    if (current && current.answers.length) {
      groups.push(current);
      current = null;
    }

    const normalized = clean(line);
    if (isListIntro(normalized)) {
      current = { question: makeListQuestion(normalized), answers: [] };
    }
  }

  if (current && current.answers.length) groups.push(current);

  return groups
    .map(group => ({ question: group.question, answers: unique(group.answers) }))
    .filter(group => group.answers.length)
    .slice(0, 12);
}

function isListIntro(line) {
  const value = clean(line);
  if (!value.endsWith(':')) return false;
  if (value.length < 12 || value.length > 110) return false;

  const lower = value.toLowerCase();
  return [
    /\bpermet(?:tent)? de\s*:/,
    /\bcomprend(?:ent)?\s*:/,
    /\bdistingue(?:nt)?\s*:/,
    /\b(?:voici|on retrouve|on distingue|il existe)\s*:/,
    /\b(?:types?|étapes?|raisons?|objectifs?|moyens?|règles?|critères?|signes?|exemples?|causes?|conséquences?|indications?|contre-indications?)\s*:/
  ].some(pattern => pattern.test(lower));
}

function makeListQuestion(line) {
  const heading = line.replace(/:$/, '').trim();
  const lower = heading.toLowerCase();

  if (/\bpermet(?:tent)? de$/i.test(lower)) {
    const subject = heading.replace(/\bpermet(?:tent)? de$/i, '').trim();
    return `Quels sont les objectifs de ${subject.toLowerCase()} ?`;
  }
  if (/\bcomprend(?:ent)?$/i.test(lower)) return `Que comprend ${heading.replace(/\bcomprend(?:ent)?$/i, '').trim()} ?`;
  if (/\bdistingue(?:nt)?$/i.test(lower)) return `Quelles sont les différentes formes de ${heading.replace(/\bdistingue(?:nt)?$/i, '').trim()} ?`;
  return `${heading} ?`;
}

function pickImportant(sentences, headings, bullets, questionGroups) {
  const groupedAnswers = questionGroups.flatMap(group => group.answers);
  const safeHeadings = headings.filter(heading => !isListIntro(`${heading}:`));
  const safeBullets = bullets.filter(item => !isListIntro(item));

  const candidates = [...groupedAnswers, ...safeBullets, ...sentences]
    .filter(item => !isListIntro(item))
    .filter(item => !/^cours test\b/i.test(item))
    .filter(item => !/^mots importants\s*:/i.test(item))
    .filter(item => !safeHeadings.includes(item));

  const seen = new Set();
  return candidates.filter(item => {
    const normalized = item.toLowerCase().replace(/[.;,!?]/g, '').trim();
    if (seen.has(normalized) || item.length < 18) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 16);
}

function unique(items) {
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
}

function uniquePairs(pairs) {
  const seen = new Set();
  return pairs.filter(([term, def]) => {
    const key = `${term.toLowerCase()}|${def.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeSummary(sentences, format) {
  const limit = format === 'short' ? 2 : 4;
  const selected = sentences.filter(s => !/^cours test\b/i.test(s)).slice(0, limit);
  return selected.length ? selected.join(' ') : 'Relis les notions ci-dessous : elles constituent les éléments principaux repérés dans ton cours.';
}

function makeFallbackQA(items) {
  return items.slice(0, 6).map(item => ({
    question: `Que faut-il retenir à propos de « ${item.split(' ').slice(0, 8).join(' ')}${item.split(' ').length > 8 ? '…' : ''} » ?`,
    answers: [item]
  }));
}

function makeQuestions(items) {
  return items.slice(0, 6).map(item => {
    const words = item.split(' ').slice(0, 8).join(' ');
    return `Que faut-il retenir à propos de « ${words}${item.split(' ').length > 8 ? '…' : ''} » ?`;
  });
}

function section(title, body) {
  return `<div class="result-section"><h3>${title}</h3>${body}</div>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function buildPlainText() {
  const clone = resultContent.cloneNode(true);
  return `${resultTitle.textContent}\n${clone.innerText}`;
}
