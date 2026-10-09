// Serron — Profile Schema
// @owner: profile
// @role: state (Single Source of Truth)
// ============================================================
// This is the ONLY place where profile structure is defined.
// Used by:
//   - Profile modals (Save/Load)
//   - Profile completeness (Progress calculation)
//   - Any other profile-related logic
// ============================================================

/**
 * Get profile schema - the single source of truth for profile structure
 * @returns {Object} Profile schema with all sections and fields
 */
export function getProfileSchema() {
  return {
    body: {
      // Basic info
      sexAtBirth: null, // 'male' | 'female' | 'prefer-not-say'
      genderIdentity: null, // 'man' | 'woman' | 'non-binary' | 'prefer-not-say'
      age: null, // 18-90
      height: null, // cm or ft
      weight: null, // kg or lb
      bodyBuild: null, // 'lean' | 'average' | 'stocky' | 'overweight' | 'not-sure'
      bloodType: null, // 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'not-sure'
      physicalActivity: null, // 'sedentary' | 'light' | 'moderate' | 'very-active'
      regularDiscomfort: [], // ['back', 'knees', 'neck', 'shoulders', 'none']
      // Legacy fields (kept for backward compatibility)
      gender: null,
      goalFocus: null,
      intensity: null,
      targetWeight: null,
      bodyGoal: null,
      // Goals tab fields
      goalsFocus: null,
      goalsPriority: 2
    },
    health: {
      // Health conditions (general wellness only)
      healthConditions: [], // ['heart', 'blood-pressure', 'cholesterol', 'diabetes', 'thyroid', 'none', 'prefer-not-say']
      prescriptionMedications: null, // 'yes' | 'no' | 'prefer-not-say'
      supplements: [], // ['vitamins', 'omega3', 'magnesium', 'protein', 'none']
      smoking: null, // 'never' | 'former' | 'current'
      alcohol: null, // 'rarely' | '1-2x-week' | '3+x-week' | 'prefer-not-say'
      lastCheckup: null, // '<6months' | '6-12months' | '>1year' | 'never'
      // Legacy fields (kept for backward compatibility)
      hasChronicDiseases: false,
      chronicDiseases: [],
      chronicDiseasesOther: '',
      takesMedications: false,
      medications: '',
      hasAllergies: false,
      allergyTypes: {
        medication: false,
        food: false,
        other: false
      },
      allergiesDetails: '',
      knowsBloodType: false,
      healthGoal: null,
      healthConcerns: [],
      limitations: '',
      // Goals tab fields
      goalsFocus: null,
      goalsPriority: 2,
      goalsConstraints: [],
      goalsNotes: ''
    },
    mind: {
      // Mental state
      stressLevel: null, // 1-5 slider (Very calm → Very stressed)
      mentalEnergy: null, // 1-5 slider (Clear → Exhausted)
      anxietyFrequency: null, // 'rarely' | 'sometimes' | 'often'
      moodChanges: null, // 'stable' | 'sometimes' | 'often'
      wantToImproveFocus: null, // 'yes' | 'no' | 'not-sure'
      // Legacy fields (kept for backward compatibility)
      mood: null,
      stress: 3,
      focus: null,
      burnout: null,
      mindMainGoal: null,
      calmnessLevel: 2,
      mainImprovement: null,
      stressTriggers: [],
      // Goals tab fields
      goalsFocus: null,
      goalsPriority: 2
    },
    lifestyle: {
      // Nutrition
      eatingPattern: null, // 'regular' | 'irregular' | 'skipping' | 'not-sure'
      dietType: null, // 'balanced' | 'low-carb' | 'high-protein' | 'vegetarian' | 'vegan' | 'not-sure'
      enoughProtein: null, // 'yes' | 'probably-low' | 'not-sure'
      sugarSweets: null, // 'rarely' | 'moderate' | 'often'
      lateEating: null, // 'rarely' | 'sometimes' | 'often'
      hydration: null, // 'low' | 'medium' | 'good' | 'not-sure'
      // Sleep
      sleepDuration: null, // '<6h' | '6-7h' | '7-8h' | '8h+'
      sleepQuality: null, // 1-5 slider
      // Legacy fields (kept for backward compatibility)
      smoking: null,
      alcohol: null,
      activeDays: null,
      stepCategory: null,
      sleepHours: null,
      stressLevel: 3,
      screenTime: null,
      mindGoal: null,
      substances: [],
      changePriority: null,
      // Goals tab fields
      goalsFocus: null,
      goalsPriority: 2
    },
    goals: {
      // Primary goals
      primaryGoals: [], // ['energy', 'heart-health', 'stress-reduction', 'longevity', 'better-sleep', 'weight-balance']
      motivationLevel: null, // 1-5 slider
      wantFromTendAI: [], // ['gentle-guidance', 'daily-reminders', 'understand-body', 'long-term-health', 'light-accountability']
      // Legacy fields (kept for backward compatibility)
      purpose: null,
      healthVsEnergy: 3,
      successVision: ''
    }
  };
}

/**
 * Get section schema
 * @param {string} sectionKey - Section key (body, health, mind, lifestyle, goals)
 * @returns {Object|null} Section schema or null if not found
 */
export function getSectionSchema(sectionKey) {
  const schema = getProfileSchema();
  return schema[sectionKey] || null;
}

/**
 * Get all section keys
 * @returns {Array<string>} Array of section keys
 */
export function getSectionKeys() {
  return Object.keys(getProfileSchema());
}

/**
 * Sidebar section order for "what should Talk ask next".
 * Matches System Integrity: Your Body → Your Health → Your Mind → Lifestyle & Habits → Goals & Intent.
 */
export const PROFILE_QUESTION_SECTION_ORDER = ['body', 'health', 'mind', 'lifestyle', 'goals'];

const PROFILE_SECTION_LABELS = {
  body: 'Your Body',
  health: 'Your Health',
  mind: 'Your Mind',
  lifestyle: 'Lifestyle & Habits',
  goals: 'Goals & Intent',
};

/**
 * Fields Talk may ask, in the same order they appear in each profile modal.
 * Legacy schema keys (gender, chronicDiseases, etc.) are intentionally omitted.
 *
 * Optional free-text "Other notes..." (health.goalsNotes) is omitted so an
 * unanswered optional note cannot block a complete profile.
 */
const PROFILE_QUESTION_CATALOG = [
  {
    key: 'body',
    fields: [
      { key: 'sexAtBirth', label: 'Sex at birth' },
      { key: 'genderIdentity', label: 'Gender identity' },
      { key: 'age', label: 'Age' },
      { key: 'height', label: 'Height' },
      { key: 'weight', label: 'Weight' },
      { key: 'bodyBuild', label: 'Body build' },
      { key: 'bloodType', label: 'Blood type' },
      { key: 'physicalActivity', label: 'Physical activity' },
      { key: 'regularDiscomfort', label: 'Regular discomfort' },
      { key: 'goalsFocus', label: 'Primary goal' },
      { key: 'goalsPriority', label: 'Priority level' },
    ],
  },
  {
    key: 'health',
    fields: [
      { key: 'healthConditions', label: 'Have you ever been told you have' },
      { key: 'prescriptionMedications', label: 'Prescription medications' },
      { key: 'supplements', label: 'Supplements' },
      { key: 'smoking', label: 'Smoking' },
      { key: 'alcohol', label: 'Alcohol' },
      { key: 'lastCheckup', label: 'Last general checkup' },
      { key: 'goalsFocus', label: 'Primary goal' },
      { key: 'goalsPriority', label: 'Priority level' },
      { key: 'goalsConstraints', label: 'Anything Obrium must consider' },
    ],
  },
  {
    key: 'mind',
    fields: [
      { key: 'stressLevel', label: 'Stress level' },
      { key: 'mentalEnergy', label: 'Mental energy' },
      { key: 'anxietyFrequency', label: 'Anxiety frequency' },
      { key: 'moodChanges', label: 'Mood changes' },
      { key: 'wantToImproveFocus', label: 'Want to improve focus' },
      { key: 'goalsFocus', label: 'Primary goal' },
      { key: 'goalsPriority', label: 'Priority level' },
    ],
  },
  {
    key: 'lifestyle',
    fields: [
      { key: 'eatingPattern', label: 'Eating pattern' },
      { key: 'dietType', label: 'Diet type' },
      { key: 'enoughProtein', label: 'Enough protein' },
      { key: 'sugarSweets', label: 'Sugar & sweets' },
      { key: 'lateEating', label: 'Late eating' },
      { key: 'hydration', label: 'Hydration' },
      { key: 'sleepDuration', label: 'Sleep duration' },
      { key: 'sleepQuality', label: 'Sleep quality' },
      { key: 'goalsFocus', label: 'Primary goal' },
      { key: 'goalsPriority', label: 'Priority level' },
    ],
  },
  {
    key: 'goals',
    fields: [
      { key: 'primaryGoals', label: 'Primary goals' },
      { key: 'motivationLevel', label: 'Motivation level' },
      { key: 'wantFromTendAI', label: 'What you want from Obrium' },
    ],
  },
];

/**
 * Ordered catalog of askable profile fields (modal-visible only).
 * @returns {Array<{ key: string, label: string, fields: Array<{ key: string, label: string }> }>}
 */
export function getProfileQuestionCatalog() {
  return PROFILE_QUESTION_CATALOG.map((section) => ({
    key: section.key,
    label: PROFILE_SECTION_LABELS[section.key],
    fields: section.fields.map((field) => ({ ...field })),
  }));
}

/**
 * Same “filled” rules as profile completeness / modal progress.
 * @param {*} value
 * @param {string} [key]
 * @returns {boolean}
 */
export function isProfileFieldAnswered(value, key) {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'select...' || lower === 'not set' || lower === '—' || lower === '-') {
      return false;
    }
  }

  if (typeof value === 'number') {
    if ((key === 'stress' || key === 'stressLevel' || key === 'healthVsEnergy') && value === 3) {
      return false;
    }
    if (key === 'goalsPriority' && value === 2) {
      return false;
    }
    return true;
  }

  if (typeof value === 'boolean') {
    return value === true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => isProfileFieldAnswered(v, k));
  }

  return true;
}

/**
 * First unanswered profile-modal field, walking Body → Health → Mind → Lifestyle → Goals.
 * Does not invent fields; skips legacy schema keys that are not shown in the modals.
 *
 * @param {Object} [profileData] - Profile state (`profileState.get()`). Empty/omitted = fresh user.
 * @returns {{ sectionKey: string, sectionLabel: string, fieldKey: string, fieldLabel: string, path: string } | null}
 */
export function getNextProfileQuestion(profileData) {
  const profile = profileData && typeof profileData === 'object' ? profileData : {};

  for (const section of PROFILE_QUESTION_CATALOG) {
    const sectionData = profile[section.key] && typeof profile[section.key] === 'object'
      ? profile[section.key]
      : {};

    for (const field of section.fields) {
      if (!isProfileFieldAnswered(sectionData[field.key], field.key)) {
        return {
          sectionKey: section.key,
          sectionLabel: PROFILE_SECTION_LABELS[section.key],
          fieldKey: field.key,
          fieldLabel: field.label,
          path: `${section.key}.${field.key}`,
        };
      }
    }
  }

  return null;
}

