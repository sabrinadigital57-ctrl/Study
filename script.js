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
  const lines = text.split(/\n+/).map(line => clean(line)).filter(Boolean);
  const sentences = splitSentences(text).map(clean).filter(Boolean);
  const bullets = lines.filter(isBullet).map(stripBullet);
  const definitions = extractDefinitions(lines);
  const headings = lines.filter(isHeading);
  const questionGroups = extractQuestionGroups(text);
  const important = pickImportant(lines, sentences, headings, bullets);
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

function clean(value) {
  return value.replace(/^\s*[-•*▪]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
}

function stripBullet(value) { return clean(value); }
function isBullet(line) { return /^\s*[-•*▪]|^\s*\d+[.)]\s*/.test(line); }
function isHeading(line) { return line.length <= 80 && (/^#{1,4}\s/.test(line) || (line.endsWith(':') && line.split(' ').length <= 12)); }

function splitSentences(text) {
  return text.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/);
}

function extractDefinitions(lines) {
  return lines.filter(line => line.includes(':')).slice(0, 10).map(line => {
    const index = line.indexOf(':');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }).filter(pair => pair[0] && pair[1]);
}

// Repère une consigne qui se termine par « : » et regroupe toutes les puces qui suivent.
// Exemple : « Le lavage des mains permet de : » + 5 puces => 1 question + 5 réponses.
function extractQuestionGroups(text) {
  const rawLines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const groups = [];
  let current = null;

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/^#+\s*/, '').trim();
    const bulletMatch = line.match(/^(?:[-•*▪]|\d+[.)])\s+(.+)$/);

    if (bulletMatch && current) {
      current.answers.push(bulletMatch[1].trim());
      continue;
    }

    if (current && current.answers.length) {
      groups.push(current);
      current = null;
    }

    if (line.endsWith(':') && line.length >= 15 && line.split(/\s+/).length <= 16) {
      current = {
        question: turnHeadingIntoQuestion(line.slice(0, -1).trim()),
        answers: []
      };
    }
  }

  if (current && current.answers.length) groups.push(current);
  return groups.slice(0, 8);
}

function turnHeadingIntoQuestion(heading) {
  const lower = heading.charAt(0).toLowerCase() + heading.slice(1);

  if (/\bpermet de$/i.test(lower)) return `${heading} quoi ?`;
  if (/\bpermettent de$/i.test(lower)) return `${heading} quoi ?`;
  if (/\bcomprend$/i.test(lower)) return `${heading} quoi ?`;
  if (/\bdistingue$/i.test(lower)) return `${heading} quoi ?`;
  if (/\btypes?$/i.test(lower)) return `${heading} quels sont-ils ?`;
  if (/\bétapes?$/i.test(lower)) return `${heading} quelles sont-elles ?`;
  return `${heading} ?`;
}

function makeFallbackQA(items, sentences) {
  return items.slice(0, 6).map(item => ({
    question: `Que faut-il retenir à propos de « ${item.split(' ').slice(0, 8).join(' ')}${item.split(' ').length > 8 ? '…' : ''} » ?`,
    answers: [item]
  }));
}

function pickImportant(lines, sentences, headings, bullets) {
  const candidates = [...bullets, ...headings.map(h => h.replace(/:$/, '')), ...sentences];
  const seen = new Set();
  return candidates.filter(item => {
    const key = item.toLowerCase();
    if (seen.has(key) || item.length < 18) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
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
