/**
 * Part 3 verification: parseProfileAnswer() — simple per-field parsing.
 * Usage: node scripts/test-profile-answer-parser.mjs
 */
import { parseProfileAnswer, classifyProfileReply } from '../mobile-app/js/features/talk/profile-answer-parser.js';
import { getNextProfileQuestion } from '../mobile-app/js/features/profile/profile-schema.js';

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
}

function q(sectionKey, fieldKey, fieldLabel = fieldKey) {
  return { sectionKey, fieldKey, fieldLabel, path: `${sectionKey}.${fieldKey}` };
}

function expectOk(name, question, text, expected) {
  const result = parseProfileAnswer(question, text);
  const passed = result.ok === true && JSON.stringify(result.value) === JSON.stringify(expected);
  record(name, passed, passed ? JSON.stringify(result.value) : JSON.stringify(result));
}

function expectClarify(name, question, text) {
  const result = parseProfileAnswer(question, text);
  const passed = result.ok === false && typeof result.clarify === 'string' && result.clarify.length > 0;
  record(name, passed, passed ? result.clarify : JSON.stringify(result));
}

expectOk('sex male', q('body', 'sexAtBirth', 'Sex at birth'), 'Male', 'male');
expectOk('sex prefer not', q('body', 'sexAtBirth', 'Sex at birth'), 'rather not say', 'prefer-not-say');
expectClarify('sex ambiguous', q('body', 'sexAtBirth', 'Sex at birth'), 'not sure about that');

expectOk('gender woman', q('body', 'genderIdentity', 'Gender identity'), 'woman', 'woman');
expectOk('age 43', q('body', 'age', 'Age'), "I'm 43", 43);
expectClarify('age missing', q('body', 'age', 'Age'), 'old enough');
expectClarify('age too young', q('body', 'age', 'Age'), '12');

expectOk('height cm', q('body', 'height', 'Height'), '180 cm', 180);
expectOk('height ft-in', q('body', 'height', 'Height'), "5'11\"", 180);
expectOk('weight kg', q('body', 'weight', 'Weight'), '82 kg', 82);
expectOk('weight lb', q('body', 'weight', 'Weight'), '180 lb', 81.5);

expectOk('build average', q('body', 'bodyBuild', 'Body build'), 'average', 'average');
expectOk('blood O+', q('body', 'bloodType', 'Blood type'), 'O positive', 'O+');
expectOk('activity moderate', q('body', 'physicalActivity', 'Physical activity'), 'moderate', 'moderate');
expectOk('discomfort none', q('body', 'regularDiscomfort', 'Regular discomfort'), 'none', ['none']);
expectOk('discomfort back knees', q('body', 'regularDiscomfort', 'Regular discomfort'), 'back and knees', ['back', 'knees']);

expectOk('stress 2', q('mind', 'stressLevel', 'Stress level'), '2', 2);
expectClarify('stress default 3', q('mind', 'stressLevel', 'Stress level'), '3');
expectOk('priority 4', q('body', 'goalsPriority', 'Priority level'), '4', 4);
expectClarify('priority default 2', q('body', 'goalsPriority', 'Priority level'), '2');

expectOk('conditions none', q('health', 'healthConditions'), 'none', ['none']);
expectOk('sleep 7-8', q('lifestyle', 'sleepDuration'), 'about 7 to 8 hours', '7-8h');

function expectKind(name, question, text, kind, value) {
  const result = classifyProfileReply(question, text);
  const passed = result.kind === kind && (kind !== 'save' || JSON.stringify(result.value) === JSON.stringify(value));
  record(name, passed, passed ? JSON.stringify(result) : JSON.stringify(result));
}

const sex = q('body', 'sexAtBirth', 'Sex at birth');
expectKind('classify male saves', sex, 'male', 'save', 'male');
expectKind('classify rather not saves', sex, "I'd rather not say", 'save', 'prefer-not-say');
expectKind('classify headache is a message', sex, 'I have a headache today', 'message');
expectKind('classify why is a message', sex, 'why do you ask?', 'message');
expectKind('classify fem clarifies', sex, 'fem', 'clarify');
expectKind('classify age number saves', q('body', 'age', 'Age'), '43', 'save', 43);
expectKind('classify wife headache is a message', sex, 'my wife is female and has a headache', 'message');
expectKind('classify short wife is a message', sex, 'my wife is female', 'message');
expectKind('classify first person sex saves', sex, 'I am female', 'save', 'female');
expectKind('classify short sex still saves', sex, 'female', 'save', 'female');
const gender = q('body', 'genderIdentity', 'Gender identity');
expectKind('classify first person gender saves', gender, "I'm a woman", 'save', 'woman');
expectKind('classify long gender about someone else is a message', gender, 'my wife is a woman and has a headache', 'message');
expectKind('classify his daughter is a message', gender, 'his daughter is a woman', 'message');
expectKind('classify rather not still saves', sex, "I'd rather not say", 'save', 'prefer-not-say');

const afterTwo = {
  body: { sexAtBirth: 'male', genderIdentity: 'man' },
};
const next = getNextProfileQuestion(afterTwo);
record('resolver still age after two body fields', next?.path === 'body.age', next?.path || 'null');

const failed = results.filter((r) => !r.passed);
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
