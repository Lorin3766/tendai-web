// TendAI — Profile Schema
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

