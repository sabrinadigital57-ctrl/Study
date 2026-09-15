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

// Analyse le cours en plusieurs blocs pour conserver la relation « consigne → liste de réponses ».
function parseCourse(text) {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map(clean).filter(Boolean);
  const sentences = splitSentences(text).map(clean).filter(Boolean);
  const bullets = lines.filter(isBullet).map(stripBullet);
  const definitions = extractDefinitions(lines);
  const headings = lines.filter(isHeading);
  const questionGroups = extractQuestionGroups(rawLines);
  return { lines, sentences, bullets, definitions, headings, questionGroups };
}

function clean(value) {
  return value
    .replace(/^\s*[-•*▪]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/^\s*#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripBullet(value) { return clean(value); }
function isBullet(line) { return /^\s*(?:[-•*▪]|\d+[.)])\s+/.test(line); }
function isHeading(line) {
  return line.length <= 90 && (/^#{1,4}\s/.test(line) || (line.endsWith(':') && line.split(/\s+/).length <= 14));
}

function splitSentences(text) {
  return text.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/);
}

function extractDefinitions(lines) {
  return lines.filter(line => line.includes(':') && !isListIntro(line)).slice(0, 10).map(line => {
    const index = line.indexOf(':');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }).filter(pair => pair[0] && pair[1]);
}

// Détecte les structures du type :
// « Le lavage des mains permet de : »
// - réponse 1
// - réponse 2
// - réponse 3
// Même si une ligne vide ou un sous-titre apparaît entre deux blocs.
function extractQuestionGroups(rawLines) {
  const groups = [];
  let current = null;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const line = raw.replace(/^\s*#+\s*/, '').trim();
    if (!line) continue;

    const bulletMatch = line.match(/^(?:[-•*▪]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      if (current) current.answers.push(clean(bulletMatch[1]));
      continue;
    }

    // Si on arrive à une nouvelle ligne de texte, le groupe précédent est terminé.
    if (current && current.answers.length) {
      groups.push(current);
      current = null;
    }

    if (isListIntro(line)) {
      current = {
        question: makeListQuestion(line),
        answers: []
      };
    }
  }

  if (current && current.answers.length) groups.push(current);

  return groups
    .filter(group => group.answers.length > 0)
    .map(group => ({
      question: group.question,
      answers: unique(group.answers)
    }))
    .filter(group => group.answers.length > 0)
    .slice(0, 12);
}

function isListIntro(line) {
  const value = line.replace(/\s+/g, ' ').trim();
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
    return `Pourquoi ${heading.charAt(0).toLowerCase()}${heading.slice(1).replace(/\bpermet(?:tent)? de$/i, '').trim()} ?`.replace(/\?$/, '?');
  }

  if (/\bcomprend(?:ent)?$/i.test(lower)) return `${heading} quoi ?`;
  if (/\bdistingue(?:nt)?$/i.test(lower)) return `${heading} quoi ?`;
  if (/\b(?:types?|étapes?|raisons?|objectifs?|moyens?|règles?|critères?|signes?|exemples?|causes?|conséquences?|indications?|contre-indications?)$/i.test(lower)) {
    return `${heading} ?`;
  }

  return `${heading} ?`;
}

function makeFallbackQA(items, sentences) {
  return items.slice(0, 6).map(item => ({
    question: `Que faut-il retenir à propos de « ${item.split(' ').slice(0, 8).join(' ')}${item.split(' ').length > 8 ? '…' : ''} » ?`,
    answers: [item]
  }));
}

function pickImportant(lines, sentences, headings, bullets, questionGroups) {
  // Les réponses de listes passent en priorité : elles contiennent souvent les notions
  // que l'utilisateur doit réellement mémoriser.
  const groupedAnswers = questionGroups.flatMap(group => group.answers);
  const candidates = [...groupedAnswers, ...bullets, ...headings.map(h => h.replace(/:$/, '')), ...sentences];
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
  const selected = sentences.filter(s => s.length > 25).slice(0, limit);
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
