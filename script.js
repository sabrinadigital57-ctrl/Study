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
  const { lines, sentences, bullets, definitions, headings, questionGroups } = structure;
  const important = pickImportant(lines, sentences, headings, bullets, questionGroups);
  const summary = makeSummary(sentences, format);

  resultTitle.textContent = `Fiche — ${headings[0] || subject}`;
  resultSubject.textContent = subject;

  let html = '';
  if (format === 'qa') {
    const qa = questionGroups.length ? questionGroups : makeFallbackQA(important, sentences);
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
    html += section('Pour te tester', `<ul class="question-list">${makeQuestions(important, sentences).map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul>`);
  }

  resultContent.innerHTML = html;
  resultCard.classList.remove('hidden');
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function parseCourse(text) {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map(clean).filter(Boolean);
  const bullets = rawLines.filter(isBullet).map(line => clean(line.replace(/^\s*(?:[-•*▪]|\d+[.)])\s+/, ''))).filter(Boolean);
  const normalizedLines = expandInlineHeadings(rawLines);
  const sentences = extractSentences(normalizedLines);
  const definitions = extractDefinitions(normalizedLines.map(clean).filter(Boolean));
  const headings = extractHeadings(normalizedLines);
  const questionGroups = extractQuestionGroups(normalizedLines);
  return { lines, sentences, bullets, definitions, headings, questionGroups };
}

function clean(value) {
  return value
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

// Certains collages depuis Word/Canva/PDF suppriment les retours à la ligne.
// On remet alors sur des lignes séparées les titres du type « 1. Définition ».
function expandInlineHeadings(rawLines) {
  const result = [];
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) {
      result.push('');
      continue;
    }

    const matches = [...line.matchAll(/(?:^|\s)(\d+[.)]\s+[A-ZÀ-ÖØ-Ý][^.!?\n]{1,70}?)(?=\s+(?:\d+[.)]\s+|[A-ZÀ-ÖØ-Ý][^.!?]{0,45}\s*:|\*\*))/g)];
    if (matches.length) {
      let current = line;
      const parts = current.split(/(?=\d+[.)]\s+[A-ZÀ-ÖØ-Ý])/g).map(part => part.trim()).filter(Boolean);
      if (parts.length > 1) {
        result.push(...parts);
        continue;
      }
    }

    result.push(line);
  }
  return result;
}

function extractHeadings(rawLines) {
  return rawLines.map(line => {
    const trimmed = line.trim();
    const withoutMarkdown = trimmed.replace(/^\s*#{1,4}\s*/, '').replace(/^\s*\*\*(.*?)\*\*\s*$/, '$1');
    const withoutNumber = withoutMarkdown.replace(/^\s*\d+[.)]\s*/, '').trim();
    return { raw: trimmed, value: withoutNumber };
  }).filter(item => isHeading(item.raw, item.value)).map(item => item.value.replace(/:$/, '').trim());
}

function isHeading(rawLine, cleanedLine = clean(rawLine)) {
  const raw = rawLine.trim();
  const markdownHeading = /^#{1,4}\s/.test(raw);
  const numberedHeading = /^\d+[.)]\s+/.test(raw) && !isBullet(raw);
  const boldHeading = /^\*\*[^*]+\*\*$/.test(raw);
  const colonHeading = cleanedLine.endsWith(':') && cleanedLine.split(/\s+/).length <= 14 && !isListIntro(cleanedLine);
  const questionHeading = cleanedLine.endsWith('?') && cleanedLine.split(/\s+/).length <= 12;
  return markdownHeading || numberedHeading || boldHeading || colonHeading || questionHeading;
}

function extractSentences(rawLines) {
  const contentLines = rawLines
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !isBullet(line))
    .filter(line => !isHeading(line));

  return contentLines
    .flatMap(line => line.replace(/\*\*/g, '').split(/(?<=[.!?])\s+/))
    .map(clean)
    .filter(sentence => sentence.length > 25 && !isListIntro(sentence));
}

function extractDefinitions(lines) {
  return lines.filter(line => line.includes(':') && !isListIntro(line) && !isHeading(line)).slice(0, 10).map(line => {
    const index = line.indexOf(':');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }).filter(pair => pair[0] && pair[1]);
}

function extractQuestionGroups(rawLines) {
  const groups = [];
  let current = null;

  for (const raw of rawLines) {
    const line = raw.replace(/^\s*#+\s*/, '').trim();
    if (!line) continue;

    const bulletMatch = line.match(/^(?:[-•*▪]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      if (current) current.answers.push(clean(bulletMatch[1]));
      continue;
    }

    if (current && current.answers.length) {
      groups.push(current);
      current = null;
    }

    const normalized = clean(line);
    if (isListIntro(normalized)) {
      current = {
        question: makeListQuestion(normalized),
        answers: []
      };
    }
  }

  if (current && current.answers.length) groups.push(current);

  return groups
    .filter(group => group.answers.length > 0)
    .map(group => ({ question: group.question, answers: unique(group.answers) }))
    .filter(group => group.answers.length > 0)
    .slice(0, 12);
}

function isListIntro(line) {
  const value = clean(line);
  if (!value.endsWith(':')) return false;
  if (value.length < 12 || value.length > 110) return false;
  if (value.split(/\s+/).length > 18) return false;

  const lower = value.toLowerCase();
  const patterns = [
    /\bpermet(?:tent)? de\s*:/,
    /\bcomprend(?:ent)?\s*:/,
    /\bdistingue(?:nt)?\s*:/,
    /\b(?:voici|on retrouve|on distingue|il existe)\s*:/,
    /\b(?:types?|étapes?|raisons?|objectifs?|moyens?|règles?|critères?|signes?|exemples?|causes?|conséquences?|indications?|contre-indications?)\s*:/
  ];

  return patterns.some(pattern => pattern.test(lower));
}

function makeListQuestion(line) {
  const heading = line.replace(/:$/, '').trim();
  const lower = heading.toLowerCase();

  if (/\bpermet(?:tent)? de$/i.test(lower)) {
    const subject = heading.replace(/\bpermet(?:tent)? de$/i, '').trim();
    return `Quels sont les objectifs de ${subject.toLowerCase()} ?`;
  }
  if (/\bcomprend(?:ent)?$/i.test(lower)) return `Que comprend ${heading.replace(/\bcomprend(?:ent)?$/i, '').trim()} ?`;
  if (/\bdistingue(?:nt)?$/i.test(lower)) return `Quelles sont les différentes formes de ${heading.replace(/\bdis(?:tingue|tinguent)$/i, '').trim()} ?`;
  if (/\b(?:types?|étapes?|raisons?|objectifs?|moyens?|règles?|critères?|signes?|exemples?|causes?|conséquences?|indications?|contre-indications?)$/i.test(lower)) return `${heading} ?`;
  return `${heading} ?`;
}

function makeFallbackQA(items, sentences) {
  return items.slice(0, 6).map(item => ({
    question: `Que faut-il retenir à propos de « ${item.split(' ').slice(0, 8).join(' ')}${item.split(' ').length > 8 ? '…' : ''} » ?`,
    answers: [item]
  }));
}

function pickImportant(lines, sentences, headings, bullets, questionGroups) {
  const groupedAnswers = questionGroups.flatMap(group => group.answers);
  const cleanHeadings = headings.filter(heading => !isListIntro(`${heading}:`));
  const safeBullets = bullets.filter(item => !isListIntro(item));
  const candidates = [...groupedAnswers, ...safeBullets, ...cleanHeadings, ...sentences]
    .filter(item => !isListIntro(item))
    .filter(item => !/^cours test\b/i.test(item));
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

function makeSummary(sentences, format) {
  const limit = format === 'short' ? 2 : 4;
  const selected = sentences.filter(s => s.length > 25 && !/^cours test\b/i.test(s)).slice(0, limit);
  return selected.length ? selected.join(' ') : 'Relis les notions ci-dessous : elles constituent les éléments principaux repérés dans ton cours.';
}

function makeQuestions(items, sentences) {
  const questions = items.slice(0, 6).map(item => {
    const words = item.split(' ').slice(0, 8).join(' ');
    return `Que faut-il retenir à propos de « ${words}${item.split(' ').length > 8 ? '…' : ''} » ?`;
  });
  if (questions.length < 3 && sentences.length) questions.push('Quelle est l’idée principale de ce cours ?');
  return questions.slice(0, 6);
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
