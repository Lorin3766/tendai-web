// Serron — Unified Profile Modals (Mobile & Desktop)
// @owner: profile
// @role: ui
// ============================================================
// АРХИТЕКТУРНЫЙ КОНТРАКТ
// ============================================================
// 
// ПУБЛИЧНЫЙ API (единственный способ работы с модалками):
//   - window.openProfileModal(section)
//   - window.openSettingsModal()
//   - window.closeProfileModal()
//
// КОНТРАКТ DOM (обязательные ID):
//   - #profileModalOverlay
//   - #profileModal
//   - #profileModalTitle
//   - #profileModalContent
//   - #settingsModalOverlay
//
// КОНТРАКТ CSS:
//   - overlay: position: fixed; inset: 0; z-index: 9999;
//   - modal: position: relative; z-index: 10000;
//
// МЕХАНИЗМ КЛИКОВ:
//   - Один глобальный обработчик: document.addEventListener('click', ...)
//   - Делегирование через: e.target.closest('[data-section]')
//   - data-section="settings" → openSettingsModal()
//   - иначе → openProfileModal(section)
//
// ============================================================

import { profileState, resolveAgeYears } from '../../state.js';
import { IS_VERBOSE_BOOT_LOGS } from '../../env-flags.js';
import { getState, updateState } from '../../core/app-state.js';
import { getProfileSchema, getSectionSchema, getSectionKeys, getProfileQuestionCatalog, isProfileFieldAnswered } from './profile-schema.js';
import { getSliderConfig } from '../storage/slider-config.js';
import { deleteBiometricsDatabase } from '../../core/biometrics-db.js';

const PROFILE_NAME_PLACEHOLDER = 'Guest';

/**
 * Checked values of a rendered checkbox group; [] when the user unticked everything,
 * null when the group is not on screen (leave the stored value alone).
 */
function readCheckboxGroup(name) {
  const inputs = document.querySelectorAll(`input[name="${name}"]`);
  if (!inputs.length) return null;
  return Array.from(inputs).filter((input) => input.checked).map((input) => input.value);
}

// Import helper functions from profile-completeness.js
// We'll duplicate the logic here to avoid circular dependencies
function isMeaningfulValue(value, key) {
  // Skip null, undefined, empty string
  if (value === null || value === undefined || value === '') {
    return false;
  }
  
  // Skip whitespace-only strings
  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }
  
  // Skip default placeholder strings
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'select...' || lower === 'not set' || lower === '—' || lower === '-' || lower === '') {
      return false;
    }
  }
  
  // Skip default numbers
  if (typeof value === 'number') {
    if ((key === 'stress' || key === 'stressLevel' || key === 'healthVsEnergy') && value === 3) {
      return false;
    }
    if (key === 'goalsPriority' && value === 2) {
      return false;
    }
    return true;
  }
  
  // Skip boolean false
  if (typeof value === 'boolean') {
    return value === true;
  }
  
  // Arrays: must have at least one element
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  
  // Objects: check if has meaningful properties
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).some(([k, v]) => isMeaningfulValue(v, k));
  }
  
  return true;
}

function countTotalFields(obj) {
  if (!obj || typeof obj !== 'object') {
    return 0;
  }
  
  let count = 0;
  for (const key in obj) {
    const value = obj[key];
    
    if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
      count++;
    } else {
      count += countTotalFields(value);
    }
  }
  
  return count;
}

function countFilledFields(profile, structure) {
  if (!profile || typeof profile !== 'object') {
    return 0;
  }
  
  let count = 0;
  
  for (const key in structure) {
    const structureValue = structure[key];
    const profileValue = profile[key];
    
    if (structureValue === null || structureValue === undefined || typeof structureValue !== 'object' || Array.isArray(structureValue)) {
      if (isMeaningfulValue(profileValue, key)) {
        count++;
      }
    } else {
      if (profileValue && typeof profileValue === 'object' && !Array.isArray(profileValue)) {
        count += countFilledFields(profileValue, structureValue);
      }
    }
  }
  
  return count;
}

(function () {
  'use strict';

  // Initialize modal elements
  let profileModalOverlay, profileModal, profileModalTitle, profileModalContent, profileModalClose;
  let currentSection = 'body';

  // Section titles
  // ============================================================
  // LOCALIZATION - Questionnaire Strings
  // ============================================================
  const copy = {
    questionnaire: {
      en: {
        // Section titles
        sectionTitles: {
    'body': 'Your body',
    'health': 'Health & Medical',
          'mind': 'Mind & Mental',
          'lifestyle': 'Lifestyle & Habits',
          'goals': 'Goals & Intent'
        },
        // Common
        select: 'Select...',
        yes: 'Yes',
        // Health module
        health: {
          chronicConditions: {
            title: 'Do you have any chronic conditions?',
            description: 'This helps AI consider limitations in recommendations',
            whyMatters: 'AI will suggest safer recommendations'
          },
          medications: {
            title: 'Do you take medications regularly?',
            description: 'List of regular medications',
            placeholder: 'E.g., metformin 500mg in the morning, aspirin 100mg in the evening...',
            whyMatters: 'Helps avoid conflicts with recommendations'
          },
          concerns: {
            title: 'What concerns you most about your health?',
            description: 'Select all that apply',
            whyMatters: 'AI will focus on what matters to you'
          },
          limitations: {
            title: 'Are there any limitations AI should consider?',
            description: 'Physical limitations, injuries, contraindications',
            placeholder: 'E.g., knee problems, cannot run...',
            whyMatters: 'AI will suggest alternative exercises and approaches'
          }
        },
        // Mind module
        mind: {
          calmness: {
            title: 'What disrupts your peace most right now?',
            description: 'Rate your level of worry',
            minLabel: 'Calm',
            maxLabel: 'Very worried',
            whyMatters: 'AI will suggest techniques to reduce anxiety'
          },
          improvements: {
            title: 'What do you want to improve in your mental state?',
            description: 'Choose the main one',
            whyMatters: 'AI will focus on what matters to you'
          },
          stressTriggers: {
            title: 'When does stress manifest most strongly?',
            description: 'Select all that apply',
            whyMatters: 'AI will help prepare for challenging moments'
          }
        },
        // Lifestyle module
        lifestyle: {
          sleep: {
            title: 'How do you usually sleep?',
            description: 'Rate your sleep quality',
            whyMatters: 'Quality sleep is the foundation of health and energy'
          },
          activity: {
            title: 'How many days per week do you move?',
            description: 'Any physical activity',
            minLabel: '0 days',
            maxLabel: '7 days',
            whyMatters: 'AI will suggest an activity plan suitable for your level'
          },
          substances: {
            title: 'Caffeine / Alcohol / Smoking',
            description: 'Select what applies',
            whyMatters: 'AI will consider the impact on sleep, energy, and health'
          },
          changePriority: {
            title: 'What habit do you want to change first?',
            description: 'Choose the main one',
            whyMatters: 'AI will focus on what matters to you'
          }
        },
        // Goals module
        goals: {
          purpose: {
            title: 'Why are you using Obrium?',
            description: 'Main motivation',
            whyMatters: 'AI will suggest recommendations aligned with your goals'
          },
          priority: {
            title: 'What matters most to you right now?',
            description: 'Set priorities',
            minLabel: 'Health',
            maxLabel: 'Energy',
            whyMatters: 'AI will balance recommendations according to your priorities'
          },
          success: {
            title: 'What result in 3 months would be success?',
            description: 'Describe your ideal outcome',
            placeholder: 'E.g., feeling energetic, sleeping 8 hours, easily climbing stairs...',
            whyMatters: 'AI will help break down the big goal into concrete steps'
          }
        },
        // Goals tab content (for all modules)
        goalsTab: {
          health: {
            focus: {
              title: 'What do you want to improve first?',
              description: 'Choose one primary focus',
              whyMatters: 'AI will prioritize recommendations based on your focus'
            },
            priority: {
              title: 'How important is this right now?',
              description: 'Set your priority level',
              minLabel: 'Low',
              maxLabel: 'Top priority',
              whyMatters: 'AI will adjust the intensity of recommendations'
            },
            constraints: {
              title: 'Anything Obrium must consider?',
              description: 'Preferences and safety notes',
              whyMatters: 'AI will tailor communication style and content'
            }
          }
        },
        // Common strings
        common: {
          select: 'Select...',
          yes: 'Yes',
          typeAnswer: 'Type your answer...'
        }
      }
    }
  };
  
  // Default language
  const lang = 'en';
  const t = copy.questionnaire[lang];
  
  const sectionTitles = t.sectionTitles;

  // КОНТРАКТ DOM: Создание модалки если её нет
  // Гарантирует наличие #profileModalOverlay в document.body
  function ensureModalExists() {
    let overlay = document.getElementById('profileModalOverlay');
    
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'profile-modal-overlay';
      overlay.id = 'profileModalOverlay';
      
      const modal = document.createElement('div');
      modal.className = 'profile-modal';
      modal.id = 'profileModal';
      
      const header = document.createElement('div');
      header.className = 'profile-modal-header';
      
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.id = 'profileModalTitle';
      title.textContent = 'Your body';
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'profile-modal-close';
      closeBtn.id = 'profileModalClose';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '×';
      
      header.appendChild(title);
      header.appendChild(closeBtn);
      
      const tabs = document.createElement('div');
      tabs.className = 'profile-modal-tabs';
      tabs.innerHTML = `
        <button class="profile-modal-tab tab-active" data-tab="profile">Profile</button>
        <button class="profile-modal-tab" data-tab="goals">Goals</button>
      `;
      
      const content = document.createElement('div');
      content.className = 'profile-modal-content';
      content.id = 'profileModalContent';
      
      const footer = document.createElement('div');
      footer.className = 'profile-modal-footer';
      footer.innerHTML = `
        <button type="button" class="btn btn-initialize profile-modal-save">Save changes</button>
        <button type="button" class="btn btn-abort profile-modal-cancel">Cancel</button>
      `;
      
      modal.appendChild(header);
      modal.appendChild(tabs);
      modal.appendChild(content);
      modal.appendChild(footer);
      
      overlay.appendChild(modal);
      // КРИТИЧНО: overlay должен быть напрямую в body, не внутри layout-grid
      document.body.appendChild(overlay);
    } else {
      // Проверка: если overlay существует, убеждаемся что он в body
      if (overlay.parentElement !== document.body) {
        const parent = overlay.parentElement;
        parent.removeChild(overlay);
        document.body.appendChild(overlay);
      }
    }
    
    return true;
  }

  function initModalElements() {
    // Ensure modal exists first
    ensureModalExists();
    
    profileModalOverlay = document.getElementById('profileModalOverlay');
    profileModal = document.getElementById('profileModal');
    profileModalTitle = document.getElementById('profileModalTitle');
    profileModalContent = document.getElementById('profileModalContent');
    profileModalClose = document.getElementById('profileModalClose');
    
    if (!profileModalOverlay || !profileModal || !profileModalTitle || !profileModalContent) {
      return false;
    }
    return true;
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (initModalElements()) {
        setupModalHandlers();
      }
    });
  } else {
    if (initModalElements()) {
      setupModalHandlers();
    }
  }

  // ============================================================
  // SMART QUESTIONNAIRE v2 - Модульная система карточек
  // ============================================================
  
  /**
   * Генерация карточки в стиле ChatGPT
   */
  function generateCard(card) {
    let html = `<div class="questionnaire-card">`;
    
    // Заголовок
    html += `<h3 class="card-title">${card.title}</h3>`;
    
    // Описание
    if (card.description) {
      html += `<p class="card-description">${card.description}</p>`;
    }
    
    // Интерактив
    html += `<div class="card-interactive">`;
    
    switch(card.type) {
      case 'checkbox':
        html += `
          <label class="card-checkbox">
            <input type="checkbox" id="${card.id}" ${card.value ? 'checked' : ''} />
            <span>${card.label || t.common.yes}</span>
          </label>
        `;
        break;
        
      case 'select':
        html += `
          <select id="${card.id}" class="card-select">
            <option value="">Select...</option>
            ${card.options.map(opt => 
              `<option value="${opt.value}" ${card.value === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('')}
          </select>
        `;
        break;
        
      case 'slider':
        // Get slider config if available
        const sliderConfig = getSliderConfig(card.id);
        const min = sliderConfig ? sliderConfig.min : (card.min || 1);
        const max = sliderConfig ? sliderConfig.max : (card.max || 5);
        const step = sliderConfig ? sliderConfig.step : (card.step || 1);
        const currentValue = card.value !== undefined ? card.value : (card.min || min);
        const displayValue = sliderConfig ? sliderConfig.displayFormatter(currentValue) : currentValue;
        
        html += `
          <div class="card-slider">
            <div class="slider-controls-row">
              <button type="button" class="slider-btn-minus" data-slider-id="${card.id}" data-step="${step}" aria-label="Decrease">−</button>
              <div class="slider-wrapper">
                <input type="range" id="${card.id}" class="slider-input-tech" min="${min}" max="${max}" 
                       step="${step}" value="${currentValue}" />
                <div class="slider-scale" aria-hidden="true"></div>
                <div class="slider-labels">
                  <span>${card.minLabel || min}</span>
                  <span class="slider-value" id="${card.id}-value">${displayValue}</span>
                  <span>${card.maxLabel || max}</span>
                </div>
              </div>
              <button type="button" class="slider-btn-plus" data-slider-id="${card.id}" data-step="${step}" aria-label="Increase">+</button>
            </div>
          </div>
        `;
        break;
        
      case 'choice':
        html += `<div class="card-choice-group">`;
        card.options.forEach(opt => {
          html += `
            <label class="card-choice status-tile">
              <input type="radio" name="${card.id}" value="${opt.value}" 
                     ${card.value === opt.value ? 'checked' : ''} />
              <span>${opt.label}</span>
            </label>
          `;
        });
        html += `</div>`;
        break;
        
      case 'multi-select':
        html += `<div class="card-multi-select">`;
        card.options.forEach(opt => {
          const isChecked = Array.isArray(card.value) && card.value.includes(opt.value);
          html += `
            <label class="card-checkbox">
              <input type="checkbox" name="${card.id}" value="${opt.value}" ${isChecked ? 'checked' : ''} />
              <span>${opt.label}</span>
            </label>
          `;
        });
        html += `</div>`;
        break;
        
      case 'text':
        html += `
          <textarea id="${card.id}" class="card-textarea" 
                    placeholder="${card.placeholder || t.common.typeAnswer}" 
                    rows="${card.rows || 3}">${card.value || ''}</textarea>
        `;
        break;
    }
    
    html += `</div>`;
    
    // "Why this matters"
    if (card.whyMatters) {
      html += `<p class="card-why-matters">${card.whyMatters}</p>`;
    }
    
    html += `</div>`;
    return html;
  }

  // Import modal content generation from app.js if available
  // For now, we'll use a simplified version that works with both mobile and desktop
  // Generate Goals tab content for a module
  function generateGoalsTabContent(section) {
    const profileData = profileState.get();
    const schema = getProfileSchema();
    
    // Use schema to ensure all sections exist with defaults
    const goalsData = { ...schema.goals, ...(profileData.goals || {}) };
    const healthData = { ...schema.health, ...(profileData.health || {}) };
    const mindData = { ...schema.mind, ...(profileData.mind || {}) };
    const lifestyleData = { ...schema.lifestyle, ...(profileData.lifestyle || {}) };
    const bodyData = { ...schema.body, ...(profileData.body || {}) };
    
    let html = `<div class="modal-section goals-view section-hidden" data-section="goals">`;
    
    switch(section) {
      case 'health':
        // Card A: Health focus
        html += generateCard({
          id: 'healthGoalsFocus',
          title: 'What do you want to improve first?',
          description: 'Choose one primary focus',
          type: 'choice',
          options: [
            { value: 'cholesterol', label: 'Cholesterol / Lab results' },
            { value: 'heart', label: 'Heart & blood pressure' },
            { value: 'energy', label: 'Energy & fatigue' },
            { value: 'digestion', label: 'Digestion' },
            { value: 'weight', label: 'Weight management' },
            { value: 'sleep', label: 'Sleep quality' },
            { value: 'longevity', label: 'Longevity focus' }
          ],
          value: healthData.goalsFocus || '',
          whyMatters: 'AI will prioritize recommendations based on your focus'
        });
        
        // Card B: Priority level
        const healthPriorityConfig = getSliderConfig('healthGoalsPriority');
        const healthPriorityValue = healthData.goalsPriority || 2;
        html += generateCard({
          id: 'healthGoalsPriority',
          title: 'How important is this right now?',
          description: 'Set your priority level',
          type: 'slider',
          min: healthPriorityConfig?.min || 1,
          max: healthPriorityConfig?.max || 4,
          step: healthPriorityConfig?.step || 1,
          minLabel: 'Low',
          maxLabel: 'Top priority',
          value: healthPriorityValue,
          whyMatters: 'AI will adjust the intensity of recommendations'
        });
        
        // Card C: Constraints / safety
        html += generateCard({
          id: 'healthGoalsConstraints',
          title: 'Anything Obrium must consider?',
          description: 'Preferences and safety notes',
          type: 'multi-select',
          options: [
            { value: 'short-answers', label: 'I prefer short answers' },
            { value: 'evidence-based', label: 'I want evidence-based tips only' },
            { value: 'avoid-medical', label: 'Avoid medical wording (diagnose/treat)' }
          ],
          value: healthData.goalsConstraints || [],
          whyMatters: 'AI will tailor communication style and content'
        });
        
        // Optional text field
        html += generateCard({
          id: 'healthGoalsNotes',
          title: 'Other notes...',
          description: 'Any additional preferences or considerations',
          type: 'text',
          placeholder: 'E.g., prefer morning routines, avoid evening activities...',
          value: healthData.goalsNotes || '',
          rows: 2,
          whyMatters: 'Helps AI personalize recommendations even further'
        });
        break;
        
      case 'mind':
        // Similar structure for mind module
        html += generateCard({
          id: 'mindGoalsFocus',
          title: 'What mental aspect matters most?',
          description: 'Choose your primary mental health focus',
          type: 'choice',
          options: [
            { value: 'stress', label: 'Stress management' },
            { value: 'focus', label: 'Focus & concentration' },
            { value: 'mood', label: 'Mood stability' },
            { value: 'sleep', label: 'Sleep quality' },
            { value: 'anxiety', label: 'Anxiety reduction' },
            { value: 'balance', label: 'Overall balance' }
          ],
          value: mindData.goalsFocus || '',
          whyMatters: 'AI will focus recommendations on what matters most to you'
        });
        
        const mindPriorityConfig = getSliderConfig('mindGoalsPriority');
        const mindPriorityValue = mindData.goalsPriority || 2;
        html += generateCard({
          id: 'mindGoalsPriority',
          title: 'How important is this right now?',
          description: 'Set your priority level',
          type: 'slider',
          min: mindPriorityConfig?.min || 1,
          max: mindPriorityConfig?.max || 4,
          step: mindPriorityConfig?.step || 1,
          minLabel: 'Low',
          maxLabel: 'Top priority',
          value: mindPriorityValue,
          whyMatters: 'AI will adjust the intensity of recommendations'
        });
        break;
        
      case 'lifestyle':
        html += generateCard({
          id: 'lifestyleGoalsFocus',
          title: 'What lifestyle change is most important?',
          description: 'Choose your primary focus',
          type: 'choice',
          options: [
            { value: 'sleep', label: 'Sleep routine' },
            { value: 'activity', label: 'Physical activity' },
            { value: 'nutrition', label: 'Nutrition habits' },
            { value: 'stress', label: 'Stress management' },
            { value: 'balance', label: 'Work-life balance' }
          ],
          value: lifestyleData.goalsFocus || '',
          whyMatters: 'AI will prioritize recommendations based on your focus'
        });
        
        const lifestylePriorityConfig = getSliderConfig('lifestyleGoalsPriority');
        const lifestylePriorityValue = lifestyleData.goalsPriority || 2;
        html += generateCard({
          id: 'lifestyleGoalsPriority',
          title: 'How important is this right now?',
          description: 'Set your priority level',
          type: 'slider',
          min: lifestylePriorityConfig?.min || 1,
          max: lifestylePriorityConfig?.max || 4,
          step: lifestylePriorityConfig?.step || 1,
          minLabel: 'Low',
          maxLabel: 'Top priority',
          value: lifestylePriorityValue,
          whyMatters: 'AI will adjust the intensity of recommendations'
        });
        break;
        
      case 'body':
        html += generateCard({
          id: 'bodyGoalsFocus',
          title: 'What body goal is most important?',
          description: 'Choose your primary focus',
          type: 'choice',
          options: [
            { value: 'weight-loss', label: 'Weight loss' },
            { value: 'muscle-gain', label: 'Muscle gain' },
            { value: 'strength', label: 'Strength improvement' },
            { value: 'endurance', label: 'Endurance' },
            { value: 'flexibility', label: 'Flexibility' },
            { value: 'maintenance', label: 'Maintenance' }
          ],
          value: bodyData.goalsFocus || '',
          whyMatters: 'AI will prioritize recommendations based on your focus'
        });
        
        const bodyPriorityConfig = getSliderConfig('bodyGoalsPriority');
        const bodyPriorityValue = bodyData.goalsPriority || 2;
        html += generateCard({
          id: 'bodyGoalsPriority',
          title: 'How important is this right now?',
          description: 'Set your priority level',
          type: 'slider',
          min: bodyPriorityConfig?.min || 1,
          max: bodyPriorityConfig?.max || 4,
          step: bodyPriorityConfig?.step || 1,
          minLabel: 'Low',
          maxLabel: 'Top priority',
          value: bodyPriorityValue,
          whyMatters: 'AI will adjust the intensity of recommendations'
        });
        break;
    }
    
    html += `</div>`;
    return html;
  }

  // UNIFIED LOAD: Uses schema to ensure consistent data structure
  function generateModalContent(section) {
    const profileData = profileState.get();
    const sectionSchema = getSectionSchema(section);
    
    if (!sectionSchema) {
      console.error('[PROFILE] Unknown section:', section);
      return '';
    }
    
    // Merge with schema to ensure all fields exist with defaults
    const sectionData = { ...sectionSchema, ...(profileData[section] || {}) };
    
    // Diagnostic log
    const loadedFields = Object.keys(sectionData).filter(key => {
      const value = sectionData[key];
      return value !== null && value !== undefined && value !== '' && 
             (Array.isArray(value) ? value.length > 0 : true) &&
             (typeof value === 'boolean' ? value === true : true);
    });
    console.log('[PROFILE] loaded', {
      section: section,
      loadedFields: loadedFields,
      data: sectionData,
      fullState: profileData
    });
    
    let html = `<div class="modal-section profile-view section-visible" data-section="profile">`;

    switch(section) {
      case 'body':
        const bodyData = sectionData;
        
        // Sex at birth
        html += generateCard({
          id: 'bodySexAtBirth',
          title: 'Sex at birth',
          type: 'choice',
          options: [
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'prefer-not-say', label: 'Prefer not to say' }
          ],
          value: bodyData.sexAtBirth || null
        });
        
        // Gender identity (optional)
        html += generateCard({
          id: 'bodyGenderIdentity',
          title: 'Gender identity (optional)',
          type: 'choice',
          options: [
            { value: 'man', label: 'Man' },
            { value: 'woman', label: 'Woman' },
            { value: 'non-binary', label: 'Non-binary' },
            { value: 'prefer-not-say', label: 'Prefer not to say' }
          ],
          value: bodyData.genderIdentity || null
        });
        
        // Age (slider 18-90)
        const ageConfig = getSliderConfig('bodyAge');
        const ageValue = bodyData.age || 30;
        html += generateCard({
          id: 'bodyAge',
          title: 'Age',
          type: 'slider',
          min: ageConfig?.min || 18,
          max: ageConfig?.max || 90,
          step: ageConfig?.step || 1,
          value: ageValue,
          minLabel: '18',
          maxLabel: '90'
          // No description - value is shown in slider-value element
        });
        
        // Height (slider, cm) - with dual units
        const heightConfig = getSliderConfig('bodyHeight');
        const heightValue = bodyData.height || 170;
        html += generateCard({
          id: 'bodyHeight',
          title: 'Height',
          type: 'slider',
          min: heightConfig?.min || 140,
          max: heightConfig?.max || 210,
          step: heightConfig?.step || 1,
          value: heightValue,
          minLabel: '140 cm',
          maxLabel: '210 cm'
          // No description - value is shown in slider-value element with dual units
        });
        
        // Weight (slider, kg) - with dual units
        const weightConfig = getSliderConfig('bodyWeight');
        const weightValue = bodyData.weight || 70;
        html += generateCard({
          id: 'bodyWeight',
          title: 'Weight',
          type: 'slider',
          min: weightConfig?.min || 40,
          max: weightConfig?.max || 150,
          step: weightConfig?.step || 0.5,
          value: weightValue,
          minLabel: '40 kg',
          maxLabel: '150 kg'
          // No description - value is shown in slider-value element with dual units
        });
        
        // Body build
        html += generateCard({
          id: 'bodyBuild',
          title: 'Body build',
          type: 'choice',
          options: [
            { value: 'lean', label: 'Lean' },
            { value: 'average', label: 'Average' },
            { value: 'stocky', label: 'Stocky' },
            { value: 'overweight', label: 'Overweight' },
            { value: 'not-sure', label: 'Not sure' }
          ],
          value: bodyData.bodyBuild || null
        });
        
        // Blood type
        html += generateCard({
          id: 'bodyBloodType',
          title: 'Blood type',
          type: 'select',
          options: [
            { value: 'A+', label: 'A+' },
            { value: 'A-', label: 'A-' },
            { value: 'B+', label: 'B+' },
            { value: 'B-', label: 'B-' },
            { value: 'AB+', label: 'AB+' },
            { value: 'AB-', label: 'AB-' },
            { value: 'O+', label: 'O+' },
            { value: 'O-', label: 'O-' },
            { value: 'not-sure', label: 'Not sure' }
          ],
          value: bodyData.bloodType || null
        });
        
        // Physical activity
        html += generateCard({
          id: 'bodyPhysicalActivity',
          title: 'Physical activity',
          type: 'choice',
          options: [
            { value: 'sedentary', label: 'Sedentary' },
            { value: 'light', label: 'Light' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'very-active', label: 'Very active' }
          ],
          value: bodyData.physicalActivity || null
        });
        
        // Regular discomfort (multi-select)
        html += generateCard({
          id: 'bodyRegularDiscomfort',
          title: 'Regular discomfort',
          type: 'multi-select',
          options: [
            { value: 'back', label: 'Back' },
            { value: 'knees', label: 'Knees' },
            { value: 'neck', label: 'Neck' },
            { value: 'shoulders', label: 'Shoulders' },
            { value: 'none', label: 'None' }
          ],
          value: bodyData.regularDiscomfort || []
        });
        break;

      case 'health':
        const healthData = sectionData;
        
        // Have you ever been told you have (general wellness only)
        html += generateCard({
          id: 'healthConditions',
          title: 'Have you ever been told you have:',
          type: 'multi-select',
          options: [
            { value: 'heart', label: 'Heart condition' },
            { value: 'blood-pressure', label: 'High blood pressure' },
            { value: 'cholesterol', label: 'High cholesterol' },
            { value: 'diabetes', label: 'Diabetes' },
            { value: 'thyroid', label: 'Thyroid issues' },
            { value: 'none', label: 'None' },
            { value: 'prefer-not-say', label: 'Prefer not to say' }
          ],
          value: healthData.healthConditions || []
        });
        
        // Prescription medications
        html += generateCard({
          id: 'healthPrescriptionMedications',
          title: 'Prescription medications',
          type: 'choice',
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'prefer-not-say', label: 'Prefer not to say' }
          ],
          value: healthData.prescriptionMedications || null
        });
        
        // Supplements
        html += generateCard({
          id: 'healthSupplements',
          title: 'Supplements',
          type: 'multi-select',
          options: [
            { value: 'vitamins', label: 'Vitamins' },
            { value: 'omega3', label: 'Omega-3' },
            { value: 'magnesium', label: 'Magnesium' },
            { value: 'protein', label: 'Protein' },
            { value: 'none', label: 'None' }
          ],
          value: healthData.supplements || []
        });
        
        // Smoking
        html += generateCard({
          id: 'healthSmoking',
          title: 'Smoking',
          type: 'choice',
          options: [
            { value: 'never', label: 'Never' },
            { value: 'former', label: 'Former' },
            { value: 'current', label: 'Current' }
          ],
          value: healthData.smoking || null
        });
        
        // Alcohol
        html += generateCard({
          id: 'healthAlcohol',
          title: 'Alcohol',
          type: 'choice',
          options: [
            { value: 'rarely', label: 'Rarely' },
            { value: '1-2x-week', label: '1–2× week' },
            { value: '3+x-week', label: '3+× week' },
            { value: 'prefer-not-say', label: 'Prefer not to say' }
          ],
          value: healthData.alcohol || null
        });
        
        // Last general checkup
        html += generateCard({
          id: 'healthLastCheckup',
          title: 'Last general checkup',
          type: 'choice',
          options: [
            { value: '<6months', label: '<6 months' },
            { value: '6-12months', label: '6–12 months' },
            { value: '>1year', label: '>1 year' },
            { value: 'never', label: 'Never' }
          ],
          value: healthData.lastCheckup || null
        });
        
        break;

      case 'mind':
        const mindData = sectionData;
        
        // Stress level (slider 1-5)
        const stressConfig = getSliderConfig('mindStressLevel');
        const stressValue = mindData.stressLevel || 3;
        html += generateCard({
          id: 'mindStressLevel',
          title: 'Stress level',
          type: 'slider',
          min: stressConfig?.min || 1,
          max: stressConfig?.max || 5,
          step: stressConfig?.step || 1,
          value: stressValue,
          minLabel: 'Very calm',
          maxLabel: 'Very stressed'
          // No description - value is shown in slider-value element
        });
        
        // Mental energy (slider 1-5)
        const mentalEnergyConfig = getSliderConfig('mindMentalEnergy');
        const mentalEnergyValue = mindData.mentalEnergy || 3;
        html += generateCard({
          id: 'mindMentalEnergy',
          title: 'Mental energy',
          type: 'slider',
          min: mentalEnergyConfig?.min || 1,
          max: mentalEnergyConfig?.max || 5,
          step: mentalEnergyConfig?.step || 1,
          value: mentalEnergyValue,
          minLabel: 'Clear',
          maxLabel: 'Exhausted'
          // No description - value is shown in slider-value element
        });
        
        // Anxiety frequency
        html += generateCard({
          id: 'mindAnxietyFrequency',
          title: 'Anxiety frequency',
          type: 'choice',
          options: [
            { value: 'rarely', label: 'Rarely' },
            { value: 'sometimes', label: 'Sometimes' },
            { value: 'often', label: 'Often' }
          ],
          value: mindData.anxietyFrequency || null
        });
        
        // Mood changes
        html += generateCard({
          id: 'mindMoodChanges',
          title: 'Mood changes',
          type: 'choice',
          options: [
            { value: 'stable', label: 'Stable' },
            { value: 'sometimes', label: 'Sometimes' },
            { value: 'often', label: 'Often' }
          ],
          value: mindData.moodChanges || null
        });
        
        // Want to improve focus
        html += generateCard({
          id: 'mindWantToImproveFocus',
          title: 'Want to improve focus',
          type: 'choice',
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'not-sure', label: 'Not sure' }
          ],
          value: mindData.wantToImproveFocus || null
        });
        
        break;

      case 'lifestyle':
        const lifestyleData = sectionData;
        
        // Nutrition section
        html += `<div class="questionnaire-section"><h4 style="margin: 20px 0 12px 0; font-size: 16px; font-weight: 600; color: var(--fg);">Nutrition</h4>`;
        
        // Eating pattern
        html += generateCard({
          id: 'lifestyleEatingPattern',
          title: 'Eating pattern',
          type: 'choice',
          options: [
            { value: 'regular', label: 'Regular' },
            { value: 'irregular', label: 'Irregular' },
            { value: 'skipping', label: 'Skipping' },
            { value: 'not-sure', label: 'Not sure' }
          ],
          value: lifestyleData.eatingPattern || null
        });
        
        // Diet type
        html += generateCard({
          id: 'lifestyleDietType',
          title: 'Diet type',
          type: 'choice',
          options: [
            { value: 'balanced', label: 'Balanced' },
            { value: 'low-carb', label: 'Low-carb' },
            { value: 'high-protein', label: 'High-protein' },
            { value: 'vegetarian', label: 'Vegetarian' },
            { value: 'vegan', label: 'Vegan' },
            { value: 'not-sure', label: 'Not sure' }
          ],
          value: lifestyleData.dietType || null
        });
        
        // Enough protein
        html += generateCard({
          id: 'lifestyleEnoughProtein',
          title: 'Enough protein',
          type: 'choice',
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'probably-low', label: 'Probably low' },
            { value: 'not-sure', label: 'Not sure' }
          ],
          value: lifestyleData.enoughProtein || null
        });
        
        // Sugar & sweets
        html += generateCard({
          id: 'lifestyleSugarSweets',
          title: 'Sugar & sweets',
          type: 'choice',
          options: [
            { value: 'rarely', label: 'Rarely' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'often', label: 'Often' }
          ],
          value: lifestyleData.sugarSweets || null
        });
        
        // Late eating
        html += generateCard({
          id: 'lifestyleLateEating',
          title: 'Late eating',
          type: 'choice',
          options: [
            { value: 'rarely', label: 'Rarely' },
            { value: 'sometimes', label: 'Sometimes' },
            { value: 'often', label: 'Often' }
          ],
          value: lifestyleData.lateEating || null
        });
        
        // Hydration
        html += generateCard({
          id: 'lifestyleHydration',
          title: 'Hydration',
          type: 'choice',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'good', label: 'Good' },
            { value: 'not-sure', label: 'Not sure' }
          ],
          value: lifestyleData.hydration || null
        });
        
        html += `</div>`;
        
        // Sleep section
        html += `<div class="questionnaire-section"><h4 style="margin: 20px 0 12px 0; font-size: 16px; font-weight: 600; color: var(--fg);">Sleep</h4>`;
        
        // Sleep duration
        html += generateCard({
          id: 'lifestyleSleepDuration',
          title: 'Sleep duration',
          type: 'choice',
          options: [
            { value: '<6h', label: '<6h' },
            { value: '6-7h', label: '6–7h' },
            { value: '7-8h', label: '7–8h' },
            { value: '8h+', label: '8h+' }
          ],
          value: lifestyleData.sleepDuration || null
        });
        
        // Sleep quality (slider 1-5)
        const sleepQualityConfig = getSliderConfig('lifestyleSleepQuality');
        const sleepQualityValue = lifestyleData.sleepQuality || 3;
        html += generateCard({
          id: 'lifestyleSleepQuality',
          title: 'Sleep quality',
          type: 'slider',
          min: sleepQualityConfig?.min || 1,
          max: sleepQualityConfig?.max || 5,
          step: sleepQualityConfig?.step || 1,
          value: sleepQualityValue,
          minLabel: 'Poor',
          maxLabel: 'Excellent'
          // No description - value is shown in slider-value element
        });
        
        html += `</div>`;
        
        break;
        
      case 'goals':
        const goalsData = sectionData;
        
        // Primary goals (multi-select)
        html += generateCard({
          id: 'goalsPrimaryGoals',
          title: 'Primary goals',
          type: 'multi-select',
          options: [
            { value: 'energy', label: 'Energy' },
            { value: 'heart-health', label: 'Heart health' },
            { value: 'stress-reduction', label: 'Stress reduction' },
            { value: 'longevity', label: 'Longevity' },
            { value: 'better-sleep', label: 'Better sleep' },
            { value: 'weight-balance', label: 'Weight balance' }
          ],
          value: goalsData.primaryGoals || []
        });
        
        // Motivation level (slider 1-5)
        const motivationConfig = getSliderConfig('goalsMotivationLevel');
        const motivationValue = goalsData.motivationLevel || 3;
        html += generateCard({
          id: 'goalsMotivationLevel',
          title: 'Motivation level',
          type: 'slider',
          min: motivationConfig?.min || 1,
          max: motivationConfig?.max || 5,
          step: motivationConfig?.step || 1,
          value: motivationValue,
          minLabel: 'Low',
          maxLabel: 'High'
          // No description - value is shown in slider-value element
        });
        
        // What you want from TendAI (multi-select)
        html += generateCard({
          id: 'goalsWantFromTendAI',
          title: 'What you want from Obrium',
          type: 'multi-select',
          options: [
            { value: 'gentle-guidance', label: 'Gentle guidance' },
            { value: 'daily-reminders', label: 'Daily reminders' },
            { value: 'understand-body', label: 'Understand my body' },
            { value: 'long-term-health', label: 'Long-term health' },
            { value: 'light-accountability', label: 'Light accountability' }
          ],
          value: goalsData.wantFromTendAI || []
        });
        
        break;
    }

    html += `</div>`;
    
    // Add Goals tab content
    html += generateGoalsTabContent(section);
    
    return html;
  }

  // Function to open modal with specific section
  function openProfileModal(section) {
    if (!initModalElements()) {
      return;
    }
    
    currentSection = section;
    window.currentProfileSection = section;
    
    try {
      profileModalTitle.textContent = sectionTitles[section] || 'Edit Profile';
      
      // Diagnostic log before loading
      const profileDataBefore = profileState.get();
      const loadedFields = Object.keys(profileDataBefore[section] || {}).filter(key => {
        const value = profileDataBefore[section][key];
        return value !== null && value !== undefined && value !== '' && 
               (Array.isArray(value) ? value.length > 0 : true) &&
               (typeof value === 'boolean' ? value === true : true);
      });
      console.log('[PROFILE] opening modal', {
        section: section,
        loadedFields: loadedFields,
        dataBefore: profileDataBefore[section] || {}
      });
      
      const content = generateModalContent(section);
      profileModalContent.innerHTML = content;
      
      // Reset tabs to Profile
      const tabs = profileModal?.querySelectorAll('.profile-modal-tab');
      const sections = profileModalContent.querySelectorAll('.modal-section');
      
      if (tabs && tabs.length > 0) {
        tabs.forEach((t) => t.classList.remove('tab-active'));
        tabs[0]?.classList.add('tab-active');
      }
      
      if (sections && sections.length > 0) {
        sections.forEach((s) => {
          s.classList.remove('section-visible');
          s.classList.add('section-hidden');
        });
        const firstSection = sections[0];
        if (firstSection) {
          firstSection.classList.remove('section-hidden');
          firstSection.classList.add('section-visible');
        }
      }
      
      // Setup interactions after content is added
      setTimeout(() => {
        setupModalInteractions(section);
        setupCardInteractions(); // Настройка интерактивов для карточек
      }, 50);
      
      // Show modal
      profileModalOverlay.classList.add('is-active');
      document.body.style.overflow = 'hidden';
      
    } catch (error) {
      // Error opening profile modal
    }
  }

  // Setup modal interactions (sliders, checkboxes, etc.)
  function setupModalInteractions(section) {
    const modalContent = document.getElementById('profileModalContent');
    if (!modalContent) return;
    
    // Setup sliders with new system
    const sliders = modalContent.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
      const sliderConfig = getSliderConfig(slider.id);
      if (!sliderConfig) return;
      
      const valueLabel = document.getElementById(`${slider.id}-value`);
      if (!valueLabel) return;
      
      // Update display on input (without saving state)
      slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const normalized = sliderConfig.normalize(value);
        // Update slider value to normalized value
        e.target.value = normalized;
        // Update display
        valueLabel.textContent = sliderConfig.displayFormatter(normalized);
      });
      
      // Setup +/- buttons
      const minusBtn = modalContent.querySelector(`.slider-btn-minus[data-slider-id="${slider.id}"]`);
      const plusBtn = modalContent.querySelector(`.slider-btn-plus[data-slider-id="${slider.id}"]`);
      
      if (minusBtn) {
        minusBtn.addEventListener('click', () => {
          const currentValue = parseFloat(slider.value);
          const newValue = Math.max(sliderConfig.min, currentValue - sliderConfig.step);
          const normalized = sliderConfig.normalize(newValue);
          slider.value = normalized;
          valueLabel.textContent = sliderConfig.displayFormatter(normalized);
          // Trigger input event to update display
          slider.dispatchEvent(new Event('input'));
        });
      }
      
      if (plusBtn) {
        plusBtn.addEventListener('click', () => {
          const currentValue = parseFloat(slider.value);
          const newValue = Math.min(sliderConfig.max, currentValue + sliderConfig.step);
          const normalized = sliderConfig.normalize(newValue);
          slider.value = normalized;
          valueLabel.textContent = sliderConfig.displayFormatter(normalized);
          // Trigger input event to update display
          slider.dispatchEvent(new Event('input'));
        });
      }
    });
    
    // Setup other inputs (non-sliders) - no auto-save, only on Save button
    const otherInputs = modalContent.querySelectorAll('input:not([type="range"]), select, textarea');
    otherInputs.forEach(input => {
      // Remove auto-save - state will be saved only on Save button click
      // Just update UI if needed
    });
    
    // Legacy sliders (kept for backward compatibility)
    const mindStressSlider = document.getElementById('editMindStress');
    const mindStressDisplay = document.getElementById('mindStressDisplay');
    if (mindStressSlider && mindStressDisplay) {
      mindStressSlider.addEventListener('input', (e) => {
        mindStressDisplay.textContent = e.target.value;
      });
    }

    const lifestyleStressSlider = document.getElementById('editStressLevel');
    const lifestyleStressDisplay = document.getElementById('lifestyleStressDisplay');
    if (lifestyleStressSlider && lifestyleStressDisplay) {
      lifestyleStressSlider.addEventListener('input', (e) => {
        lifestyleStressDisplay.textContent = e.target.value;
      });
    }

    // Blood type checkbox
    const knowsBloodType = document.getElementById('editKnowsBloodType');
    const bloodTypeSelect = document.getElementById('editBloodType');
    if (knowsBloodType && bloodTypeSelect) {
      knowsBloodType.addEventListener('change', (e) => {
        bloodTypeSelect.disabled = !e.target.checked;
      });
    }
  }

  // Function to close modal
  function closeProfileModal() {
    if (profileModalOverlay) {
      profileModalOverlay.classList.remove('is-active');
      document.body.style.overflow = '';
    }
  }

  // Save profile data from modal to profileState
  // UNIFIED SAVE: Uses schema to ensure all sections work the same way
  function saveProfileDataToState() {
    try {
      const modalContent = document.getElementById('profileModalContent');
      if (!modalContent) return;

      const currentSection = window.currentProfileSection || 'body';
      const profileData = profileState.get();
      
      // Ensure section exists in profileData using schema
      const sectionSchema = getSectionSchema(currentSection);
      if (!sectionSchema) {
        console.error('[PROFILE] Unknown section:', currentSection);
        return;
      }
      
      if (!profileData[currentSection]) {
        // Initialize section from schema
        profileData[currentSection] = JSON.parse(JSON.stringify(sectionSchema));
      }

      // Save based on current section
      switch (currentSection) {
        case 'body':
          // New questionnaire fields
          const sexAtBirth = document.querySelector('input[name="bodySexAtBirth"]:checked');
          const genderIdentity = document.querySelector('input[name="bodyGenderIdentity"]:checked');
          const ageSlider = document.getElementById('bodyAge');
          const heightSlider = document.getElementById('bodyHeight');
          const weightSlider = document.getElementById('bodyWeight');
          const bodyBuild = document.querySelector('input[name="bodyBuild"]:checked');
          const bloodType = document.getElementById('bodyBloodType');
          const physicalActivity = document.querySelector('input[name="bodyPhysicalActivity"]:checked');
          const regularDiscomfort = readCheckboxGroup('bodyRegularDiscomfort');
          
          if (sexAtBirth) profileData.body.sexAtBirth = sexAtBirth.value;
          if (genderIdentity) profileData.body.genderIdentity = genderIdentity.value;
          if (ageSlider) {
            const ageConfig = getSliderConfig('bodyAge');
            profileData.body.age = ageConfig ? ageConfig.normalize(parseFloat(ageSlider.value)) : parseInt(ageSlider.value, 10);
          }
          if (heightSlider) {
            const heightConfig = getSliderConfig('bodyHeight');
            profileData.body.height = heightConfig ? heightConfig.normalize(parseFloat(heightSlider.value)) : parseInt(heightSlider.value, 10);
          }
          if (weightSlider) {
            const weightConfig = getSliderConfig('bodyWeight');
            profileData.body.weight = weightConfig ? weightConfig.normalize(parseFloat(weightSlider.value)) : parseFloat(weightSlider.value);
          }
          if (bodyBuild) profileData.body.bodyBuild = bodyBuild.value;
          if (bloodType) profileData.body.bloodType = bloodType.value || null;
          if (physicalActivity) profileData.body.physicalActivity = physicalActivity.value;
          if (regularDiscomfort) profileData.body.regularDiscomfort = regularDiscomfort;
          
          // Legacy fields (kept for backward compatibility)
          const ageInput = document.getElementById('editAge');
          const genderSelect = document.getElementById('editGender');
          const heightInput = document.getElementById('editHeight');
          const weightInput = document.getElementById('editWeight');
          const mainGoalSelect = document.getElementById('editMainGoal');
          const goalIntensitySelect = document.getElementById('editGoalIntensity');
          const targetWeightInput = document.getElementById('editTargetWeight');

          if (ageInput && !ageSlider) {
            const ageValue = ageInput.value.trim();
            if (ageValue) profileData.body.age = parseInt(ageValue, 10);
          }
          if (genderSelect) {
            const genderValue = genderSelect.value.trim();
            if (genderValue) profileData.body.gender = genderValue;
          }
          if (heightInput && !heightSlider) {
            const heightValue = heightInput.value.trim();
            if (heightValue) profileData.body.height = parseInt(heightValue, 10);
          }
          if (weightInput && !weightSlider) {
            const weightValue = weightInput.value.trim();
            if (weightValue) profileData.body.weight = parseFloat(weightValue);
          }
          if (mainGoalSelect) {
            const goalValue = mainGoalSelect.value.trim();
            if (goalValue) profileData.body.goalFocus = goalValue;
          }
          if (goalIntensitySelect) {
            const intensityValue = goalIntensitySelect.value.trim();
            if (intensityValue) profileData.body.intensity = parseInt(intensityValue, 10);
          }
          if (targetWeightInput) {
            const targetValue = targetWeightInput.value.trim();
            if (targetValue) profileData.body.targetWeight = parseFloat(targetValue);
          }
          
          // Goals tab cards
          const bodyGoalsFocus = document.querySelector('input[name="bodyGoalsFocus"]:checked');
          const bodyGoalsPriority = document.getElementById('bodyGoalsPriority');
          
          if (bodyGoalsFocus) profileData.body.goalsFocus = bodyGoalsFocus.value;
          if (bodyGoalsPriority) {
            const bodyPriorityConfig = getSliderConfig('bodyGoalsPriority');
            profileData.body.goalsPriority = bodyPriorityConfig ? bodyPriorityConfig.normalize(parseFloat(bodyGoalsPriority.value)) : (parseInt(bodyGoalsPriority.value) || 2);
          }
          break;

        case 'health':
          // New questionnaire fields
          const healthConditions = readCheckboxGroup('healthConditions');
          const prescriptionMedications = document.querySelector('input[name="healthPrescriptionMedications"]:checked');
          const supplements = readCheckboxGroup('healthSupplements');
          const healthSmoking = document.querySelector('input[name="healthSmoking"]:checked');
          const healthAlcohol = document.querySelector('input[name="healthAlcohol"]:checked');
          const lastCheckup = document.querySelector('input[name="healthLastCheckup"]:checked');
          
          if (healthConditions) profileData.health.healthConditions = healthConditions;
          if (prescriptionMedications) profileData.health.prescriptionMedications = prescriptionMedications.value;
          if (supplements) profileData.health.supplements = supplements;
          if (healthSmoking) profileData.health.smoking = healthSmoking.value;
          if (healthAlcohol) profileData.health.alcohol = healthAlcohol.value;
          if (lastCheckup) profileData.health.lastCheckup = lastCheckup.value;
          
          // Legacy fields (kept for backward compatibility)
          const healthChronicConditions = document.querySelectorAll('#healthChronicConditions input[type="checkbox"]:checked');
          const healthMedications = document.getElementById('healthMedications');
          const healthConcerns = document.querySelectorAll('#healthConcerns input[type="checkbox"]:checked');
          const healthLimitations = document.getElementById('healthLimitations');
          
          if (healthChronicConditions && healthChronicConditions.length > 0) {
            profileData.health.chronicDiseases = Array.from(healthChronicConditions).map(cb => cb.value);
          }
          if (healthMedications) profileData.health.medications = healthMedications.value || '';
          if (healthConcerns && healthConcerns.length > 0) {
            profileData.health.healthConcerns = Array.from(healthConcerns).map(cb => cb.value);
          }
          if (healthLimitations) profileData.health.limitations = healthLimitations.value || '';
          
          // Goals tab cards
          const healthGoalsFocus = document.querySelector('input[name="healthGoalsFocus"]:checked');
          const healthGoalsPriority = document.getElementById('healthGoalsPriority');
          const healthGoalsConstraints = readCheckboxGroup('healthGoalsConstraints');
          const healthGoalsNotes = document.getElementById('healthGoalsNotes');
          
          if (healthGoalsFocus) profileData.health.goalsFocus = healthGoalsFocus.value;
          if (healthGoalsPriority) {
            const healthPriorityConfig = getSliderConfig('healthGoalsPriority');
            profileData.health.goalsPriority = healthPriorityConfig ? healthPriorityConfig.normalize(parseFloat(healthGoalsPriority.value)) : (parseInt(healthGoalsPriority.value) || 2);
          }
          if (healthGoalsConstraints) profileData.health.goalsConstraints = healthGoalsConstraints;
          if (healthGoalsNotes) profileData.health.goalsNotes = healthGoalsNotes.value || '';
          
          // Legacy fields for backward compatibility
          const hasChronicDiseases = document.getElementById('editHasChronicDiseases');
          const chronicDiseasesCheckboxes = document.querySelectorAll('.chronic-disease-checkbox:checked');
          const takesMedications = document.getElementById('editTakesMedications');
          const medications = document.getElementById('editMedications');
          if (hasChronicDiseases) profileData.health.hasChronicDiseases = hasChronicDiseases.checked;
          if (chronicDiseasesCheckboxes && chronicDiseasesCheckboxes.length > 0) {
            profileData.health.chronicDiseases = Array.from(chronicDiseasesCheckboxes).map(cb => cb.value);
          }
          if (takesMedications) profileData.health.takesMedications = takesMedications.checked;
          if (medications && !healthMedications) profileData.health.medications = medications.value || '';
          break;

        case 'mind':
          // New questionnaire fields
          const mindStressLevel = document.getElementById('mindStressLevel');
          const mindMentalEnergy = document.getElementById('mindMentalEnergy');
          const anxietyFrequency = document.querySelector('input[name="mindAnxietyFrequency"]:checked');
          const moodChanges = document.querySelector('input[name="mindMoodChanges"]:checked');
          const wantToImproveFocus = document.querySelector('input[name="mindWantToImproveFocus"]:checked');
          
          if (mindStressLevel) {
            const stressConfig = getSliderConfig('mindStressLevel');
            profileData.mind.stressLevel = stressConfig ? stressConfig.normalize(parseFloat(mindStressLevel.value)) : parseInt(mindStressLevel.value, 10);
          }
          if (mindMentalEnergy) {
            const energyConfig = getSliderConfig('mindMentalEnergy');
            profileData.mind.mentalEnergy = energyConfig ? energyConfig.normalize(parseFloat(mindMentalEnergy.value)) : parseInt(mindMentalEnergy.value, 10);
          }
          if (anxietyFrequency) profileData.mind.anxietyFrequency = anxietyFrequency.value;
          if (moodChanges) profileData.mind.moodChanges = moodChanges.value;
          if (wantToImproveFocus) profileData.mind.wantToImproveFocus = wantToImproveFocus.value;
          
          // Goals tab cards
          const mindGoalsFocus = document.querySelector('input[name="mindGoalsFocus"]:checked');
          const mindGoalsPriority = document.getElementById('mindGoalsPriority');
          
          if (mindGoalsFocus) profileData.mind.goalsFocus = mindGoalsFocus.value;
          if (mindGoalsPriority) {
            const mindPriorityConfig = getSliderConfig('mindGoalsPriority');
            profileData.mind.goalsPriority = mindPriorityConfig ? mindPriorityConfig.normalize(parseFloat(mindGoalsPriority.value)) : (parseInt(mindGoalsPriority.value) || 2);
          }
          
          // Legacy fields for backward compatibility
          const mindCalmness = document.getElementById('mindCalmness');
          const mindImprovements = document.querySelector('input[name="mindImprovements"]:checked');
          const mindStressTriggers = document.querySelectorAll('#mindStressTriggers input[type="checkbox"]:checked');
          const mindMood = document.getElementById('editMindMood');
          const mindStress = document.getElementById('editMindStress');
          
          if (mindCalmness) profileData.mind.calmnessLevel = parseInt(mindCalmness.value) || 2;
          if (mindImprovements) profileData.mind.mainImprovement = mindImprovements.value;
          if (mindStressTriggers && mindStressTriggers.length > 0) {
            profileData.mind.stressTriggers = Array.from(mindStressTriggers).map(cb => cb.value);
          }
          if (mindMood) profileData.mind.mood = mindMood.value || null;
          if (mindStress) profileData.mind.stress = parseInt(mindStress.value) || 3;
          break;

        case 'lifestyle':
          // New questionnaire fields
          const eatingPattern = document.querySelector('input[name="lifestyleEatingPattern"]:checked');
          const dietType = document.querySelector('input[name="lifestyleDietType"]:checked');
          const enoughProtein = document.querySelector('input[name="lifestyleEnoughProtein"]:checked');
          const sugarSweets = document.querySelector('input[name="lifestyleSugarSweets"]:checked');
          const lateEating = document.querySelector('input[name="lifestyleLateEating"]:checked');
          const hydration = document.querySelector('input[name="lifestyleHydration"]:checked');
          const sleepDuration = document.querySelector('input[name="lifestyleSleepDuration"]:checked');
          const sleepQuality = document.getElementById('lifestyleSleepQuality');
          
          if (eatingPattern) profileData.lifestyle.eatingPattern = eatingPattern.value;
          if (dietType) profileData.lifestyle.dietType = dietType.value;
          if (enoughProtein) profileData.lifestyle.enoughProtein = enoughProtein.value;
          if (sugarSweets) profileData.lifestyle.sugarSweets = sugarSweets.value;
          if (lateEating) profileData.lifestyle.lateEating = lateEating.value;
          if (hydration) profileData.lifestyle.hydration = hydration.value;
          if (sleepDuration) profileData.lifestyle.sleepDuration = sleepDuration.value;
          if (sleepQuality) {
            const sleepQualityConfig = getSliderConfig('lifestyleSleepQuality');
            profileData.lifestyle.sleepQuality = sleepQualityConfig ? sleepQualityConfig.normalize(parseFloat(sleepQuality.value)) : parseInt(sleepQuality.value, 10);
          }
          
          // Goals tab cards
          const lifestyleGoalsFocus = document.querySelector('input[name="lifestyleGoalsFocus"]:checked');
          const lifestyleGoalsPriority = document.getElementById('lifestyleGoalsPriority');
          
          if (lifestyleGoalsFocus) profileData.lifestyle.goalsFocus = lifestyleGoalsFocus.value;
          if (lifestyleGoalsPriority) {
            const lifestylePriorityConfig = getSliderConfig('lifestyleGoalsPriority');
            profileData.lifestyle.goalsPriority = lifestylePriorityConfig ? lifestylePriorityConfig.normalize(parseFloat(lifestyleGoalsPriority.value)) : (parseInt(lifestyleGoalsPriority.value) || 2);
          }
          
          // Legacy fields for backward compatibility
          const lifestyleSleep = document.querySelector('input[name="lifestyleSleep"]:checked');
          const lifestyleActivity = document.getElementById('lifestyleActivity');
          const lifestyleSubstances = document.querySelectorAll('#lifestyleSubstances input[type="checkbox"]:checked');
          const lifestyleChangePriority = document.querySelector('input[name="lifestyleChangePriority"]:checked');
          const activeDays = document.getElementById('editActiveDays');
          const sleepHours = document.getElementById('editSleepHours');
          
          if (lifestyleSleep && !sleepDuration) profileData.lifestyle.sleepQuality = lifestyleSleep.value;
          if (lifestyleActivity) profileData.lifestyle.activeDays = parseInt(lifestyleActivity.value) || 0;
          if (lifestyleSubstances && lifestyleSubstances.length > 0) {
            profileData.lifestyle.substances = Array.from(lifestyleSubstances).map(cb => cb.value);
          }
          if (lifestyleChangePriority) profileData.lifestyle.changePriority = lifestyleChangePriority.value;
          if (activeDays && !lifestyleActivity) profileData.lifestyle.activeDays = activeDays.value ? parseInt(activeDays.value) : null;
          if (sleepHours && !sleepQuality) profileData.lifestyle.sleepHours = sleepHours.value ? parseFloat(sleepHours.value) : null;
          break;
          
        case 'goals':
          // New questionnaire fields
          const primaryGoals = readCheckboxGroup('goalsPrimaryGoals');
          const motivationLevel = document.getElementById('goalsMotivationLevel');
          const wantFromTendAI = readCheckboxGroup('goalsWantFromTendAI');
          
          if (primaryGoals) profileData.goals.primaryGoals = primaryGoals;
          if (motivationLevel) {
            const motivationConfig = getSliderConfig('goalsMotivationLevel');
            profileData.goals.motivationLevel = motivationConfig ? motivationConfig.normalize(parseFloat(motivationLevel.value)) : parseInt(motivationLevel.value, 10);
          }
          if (wantFromTendAI) profileData.goals.wantFromTendAI = wantFromTendAI;
          
          // Legacy fields (kept for backward compatibility)
          const goalsPurpose = document.querySelector('input[name="goalsPurpose"]:checked');
          const goalsPriority = document.getElementById('goalsPriority');
          const goalsSuccess = document.getElementById('goalsSuccess');
          
          if (goalsPurpose) {
            if (!profileData.goals) profileData.goals = {};
            profileData.goals.purpose = goalsPurpose.value;
          }
          if (goalsPriority) {
            if (!profileData.goals) profileData.goals = {};
            profileData.goals.healthVsEnergy = parseInt(goalsPriority.value) || 3;
          }
          if (goalsSuccess) {
            if (!profileData.goals) profileData.goals = {};
            profileData.goals.successVision = goalsSuccess.value || '';
          }
          break;
      }

      // Save updated profile state
      profileState.save(profileData);
      
      // Update next step display
      if (window.updateNextStepDisplay) {
        window.updateNextStepDisplay();
      }
      
      // Diagnostic log
      console.log('[PROFILE] saved', {
        section: currentSection,
        data: profileData[currentSection],
        filledFields: Object.keys(profileData[currentSection] || {}).filter(key => {
          const value = profileData[currentSection][key];
          return value !== null && value !== undefined && value !== '' && 
                 (Array.isArray(value) ? value.length > 0 : true) &&
                 (typeof value === 'boolean' ? value === true : true);
        }),
        fullState: profileData
      });
      
      // Update UI after saving
      updateProfileUI();
      
      // Update profile completeness percentage
      if (window.updateProfileCompletenessDisplay) {
        window.updateProfileCompletenessDisplay();
      }
    } catch (error) {
      console.error('[PROFILE] Error saving profile data', error);
    }
  }

  // Update mobile profile screen display
  function updateMobileProfileScreen(profileData) {
    const mobileProfileName = document.getElementById('mobileProfileName');
    const mobileProfileAge = document.getElementById('mobileProfileAge');
    const mobileProfileAvatar = document.getElementById('mobileProfileAvatar');

    renderProfileName(mobileProfileName, mobileProfileAvatar, profileData);

    if (mobileProfileAge) {
      const age = resolveAgeYears(profileData.body);
      if (age != null) mobileProfileAge.textContent = `${age} yrs`;
    }

    // Section progress is now handled by updateSectionProgress()
    // This old status code is removed to avoid conflicts
  }

  // Update profile UI (left panel in desktop, profile screen in mobile)
  function updateProfileUI() {
    const profileData = profileState.get();

    // Keep stored age aligned with birthYear (source of truth)
    if (profileData.body) {
      const derived = resolveAgeYears(profileData.body);
      if (derived != null && profileData.body.age !== derived) {
        profileData.body.age = derived;
        profileState.save(profileData);
      }
    }
    
    // Update desktop left panel
    updateDesktopLeftPanel(profileData);
    
    // Update mobile profile screen
    updateMobileProfileScreen(profileData);
    
    // Update section-level progress (X / Y)
    updateSectionProgress(profileData);
  }
  
  /**
   * Update section-level progress for each System Integrity area.
   * Uses the same askable fields as Talk (`getProfileQuestionCatalog`), so Complete
   * means Talk has nothing left to ask in that section.
   * @param {Object} profileData - Current profile data
   */
  function updateSectionProgress(profileData) {
    const catalog = getProfileQuestionCatalog();

    catalog.forEach((section) => {
      const sectionData = profileData[section.key] || {};
      const totalFields = section.fields.length;
      const filledFields = section.fields.filter((field) =>
        isProfileFieldAnswered(sectionData[field.key], field.key)
      ).length;

      const statusElements = document.querySelectorAll(`[data-profile-status="${section.key}"]`);
      statusElements.forEach(el => {
        // Soft profile-area language — not a checklist fraction
        let label = 'Not started';
        let stateClass = 'is-empty';
        if (totalFields > 0 && filledFields >= totalFields) {
          label = 'Complete';
          stateClass = 'is-complete';
        } else if (filledFields > 0) {
          label = 'In progress';
          stateClass = 'is-partial';
        }
        el.textContent = label;
        el.classList.remove('is-empty', 'is-partial', 'is-complete');
        el.classList.add(stateClass);
        el.removeAttribute('style');
        el.title = `${filledFields} of ${totalFields} details filled`;
      });
    });

    if (IS_VERBOSE_BOOT_LOGS && typeof console !== 'undefined' && console.log) {
      console.log('[INIT] Profile UI updated (' + catalog.length + ' sections).');
    }
  }

  // Update desktop left panel profile display
  function updateDesktopLeftPanel(profileData) {
    const profileName = document.getElementById('profileName');
    const profileAge = document.getElementById('profileAge');
    const profileAvatar = document.getElementById('profileAvatar');

    renderProfileName(profileName, profileAvatar, profileData);
    
    // Update age (prefer birthYear-derived age)
    if (profileAge) {
      const age = resolveAgeYears(profileData.body);
      if (age != null) profileAge.textContent = `${age} yrs`;
    }
  }

  /**
   * Show the user's real name (or a neutral placeholder) without wiping the
   * status-dot <span> that lives inside the name element.
   */
  function renderProfileName(nameEl, avatarEl, profileData) {
    const raw = profileData?.body?.name;
    const name = typeof raw === 'string' && raw.trim() ? raw.trim() : PROFILE_NAME_PLACEHOLDER;
    if (nameEl) {
      let textNode = Array.from(nameEl.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (!textNode) {
        textNode = document.createTextNode('');
        nameEl.insertBefore(textNode, nameEl.firstChild);
      }
      textNode.textContent = `${name} `;
    }
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  // Setup modal handlers
  function setupModalHandlers() {
    // Close button handler
    // Файл: profile-modals.js, строка ~742
    // Зачем: Закрытие модалки по кнопке X
    // Защита: работает только внутри модалки, не мешает [data-section]
    if (profileModalClose) {
      profileModalClose.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        e.stopPropagation();
        closeProfileModal();
      });
    }

    // Overlay click handler
    // Файл: profile-modals.js, строка ~750
    // Зачем: Закрытие модалки по клику на overlay
    // Защита: работает только внутри overlay, не мешает [data-section]
    if (profileModalOverlay) {
      profileModalOverlay.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        if (e.target === profileModalOverlay) {
          closeProfileModal();
        }
      });
    }

    // Prevent modal content clicks from closing
    // Файл: profile-modals.js, строка ~759
    // Зачем: Предотвращение закрытия при клике внутри модалки
    // Защита: работает только внутри модалки, не мешает [data-section]
    if (profileModal) {
      profileModal.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        e.stopPropagation();
      });
    }

    // Tab switching
    // Файл: profile-modals.js, строка ~765
    // Зачем: Переключение вкладок внутри модалки
    // Защита: работает только внутри модалки, не мешает [data-section]
    if (profileModal) {
      profileModal.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        
        const tab = e.target.closest('.profile-modal-tab');
        if (!tab) return;

        e.preventDefault();
        e.stopPropagation();

        const targetTab = tab.getAttribute('data-tab');
        const tabs = profileModal.querySelectorAll('.profile-modal-tab');
        const content = document.getElementById('profileModalContent');
        const sections = content?.querySelectorAll('.modal-section');

        if (tabs && sections) {
          tabs.forEach((t) => t.classList.remove('tab-active'));
          tab.classList.add('tab-active');

          sections.forEach((section) => {
            if (section.getAttribute('data-section') === targetTab) {
              section.classList.remove('section-hidden');
              section.classList.add('section-visible');
            } else {
              section.classList.remove('section-visible');
              section.classList.add('section-hidden');
            }
          });
        }
      });
    }

    // Save and Cancel buttons
    // Файл: profile-modals.js, строка ~797
    // Зачем: Сохранение/отмена в модалке
    // Защита: работает только внутри модалки, не мешает [data-section]
    if (profileModal) {
      profileModal.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        
        if (e.target.classList.contains('profile-modal-save')) {
          saveProfileDataToState();
          closeProfileModal();
        } else if (e.target.classList.contains('profile-modal-cancel')) {
          closeProfileModal();
        }
      });
    }
  }

  // АРХИТЕКТУРНЫЙ КОНТРАКТ: Единый универсальный обработчик кликов
  // ============================================================
  // Один глобальный обработчик для всех кликов по [data-section]
  // Делегирование через e.target.closest('[data-section]')
  // НЕ использовать локальные обработчики на кнопках Profile/Settings
  // ============================================================
  function setupUniversalClickHandler() {
    // Защита от дублей
    if (document.__profileModalsClickHandlerAttached) {
      return;
    }
    document.__profileModalsClickHandlerAttached = true;
    
    // ЕДИНЫЙ обработчик для ВСЕХ кликов (data-section + settings actions)
    // BUBBLE фаза (capture: false)
    document.addEventListener('click', function(e) {
      // 1. Обработка [data-section] элементов
      // Объявляем переменную в начале функции для правильной области видимости
      const target = e.target.closest('[data-section]');
      
      // Если есть элемент с data-section → обрабатываем его
      if (target) {
        // Игнорируем клики внутри модалок (кнопки Save/Cancel и т.д.)
        if (e.target.closest('.profile-modal') || e.target.closest('.profile-modal-overlay') || 
            e.target.closest('.settings-modal-content')) {
      return;
    }
    
        e.preventDefault();
        e.stopPropagation();
        
        // Получаем section из data-section атрибута
        const section = target.getAttribute('data-section');
        
        // Settings открывает модалку настроек
        if (section === 'settings') {
          if (window.openSettingsModal) {
            window.openSettingsModal();
          }
      return;
    }
    
        // Все остальные секции открывают профильную модалку
        if (window.openProfileModal) {
          window.openProfileModal(section);
        }
        return;
      }
      
      // Если нет [data-section], продолжаем обработку других действий
      
      // 2. Обработка действий внутри Settings модалки (не через data-section)
      // Edit profile data
      if (e.target.closest('#settingsEditProfile')) {
        e.preventDefault();
        e.stopPropagation();
        if (window.closeSettingsModal) {
          window.closeSettingsModal();
        }
        if (window.openProfileModal) {
          window.openProfileModal('body');
        }
        return;
      }
      
      // Остальные действия в Settings (coming soon, etc.)
      if (e.target.closest('#settingsSendLogToDev')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.sendLogToDev === 'function') {
          window.sendLogToDev();
        }
        return;
      }

      if (e.target.closest('#settingsPrivacyPolicy')) {
        e.preventDefault();
        e.stopPropagation();
        window.location.assign('privacy-policy.html');
        return;
      }
      if (e.target.closest('#settingsTermsOfUse')) {
        e.preventDefault();
        e.stopPropagation();
        window.location.assign('terms-of-use.html');
        return;
      }

      if (e.target.closest('#settingsConnectSources') ||
          e.target.closest('#settingsSendFeedback') ||
          e.target.closest('#settingsRateApp')) {
          e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      // Delete all local data
      if (e.target.closest('#settingsDeleteData')) {
        e.preventDefault();
        e.stopPropagation();
        const confirmed = confirm('Are you sure you want to delete all local data? This cannot be undone.');
        if (confirmed) {
          localStorage.clear();
          try { sessionStorage.clear(); } catch (_) {}
          deleteBiometricsDatabase()
            .catch(() => false)
            .then(() => location.reload());
        }
          return;
        }
    }, { capture: false }); // Используем bubble для совместимости
    
    // Profile menu toggle (отдельный обработчик, не через data-section)
    const profileMenuToggle = document.getElementById('profileMenuToggle');
    if (profileMenuToggle) {
      profileMenuToggle.addEventListener('click', (e) => {
        // Проверяем, не клик по [data-section] внутри меню
        if (e.target.closest('[data-section]')) {
          return; // Позволяем универсальному обработчику обработать
        }
        e.stopPropagation();
        const profileMenu = document.getElementById('profileMenu');
        if (profileMenu) {
          profileMenu.hidden = !profileMenu.hidden;
        }
      });
    }
  }

  // Initialize click handlers
  function initializeProfileHandlers() {
    // Показываем меню в desktop режиме
    if (window.innerWidth >= 1025) {
      const profileMenu = document.getElementById('profileMenu');
      if (profileMenu) {
        profileMenu.removeAttribute('hidden');
        profileMenu.style.display = 'grid';
        profileMenu.style.visibility = 'visible';
      }
    }
    
    // Устанавливаем единый универсальный обработчик
    setupUniversalClickHandler();
    
    // Обновляем UI
    updateProfileUI();
  }
  
  // ============================================================
  // ПУБЛИЧНЫЙ API - КОНТРАКТ
  // ============================================================
  // Экспортируем ТОЛЬКО эти функции. Никаких прямых манипуляций DOM из других файлов.
  // ============================================================
  window.openProfileModal = openProfileModal;
  window.closeProfileModal = closeProfileModal;
  window.openSettingsModal = function() {
    // Будет заменено в initSettingsModal()
  };
  
  // Вспомогательные функции (не часть публичного API модалок)
  window.updateProfileUI = updateProfileUI;
  window.updateDesktopLeftPanel = updateDesktopLeftPanel;
  
  
  // Initialize handlers
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeProfileHandlers();
    });
  } else {
    initializeProfileHandlers();
  }
  
  // Update on window resize
  window.addEventListener('resize', () => {
    const profileMenu = document.getElementById('profileMenu');
    const profileMenuToggle = document.getElementById('profileMenuToggle');
    if (window.innerWidth >= 1025) {
      // Desktop: show menu, hide toggle
      if (profileMenu) {
        profileMenu.removeAttribute('hidden');
        profileMenu.style.display = 'grid';
        profileMenu.style.visibility = 'visible';
      }
      if (profileMenuToggle) {
        profileMenuToggle.style.display = 'none';
      }
    } else {
      // Mobile: hide menu, show toggle
      if (profileMenu) {
        profileMenu.setAttribute('hidden', '');
      }
      if (profileMenuToggle) {
        profileMenuToggle.style.display = 'flex';
      }
    }
  });

  // Create Settings modal HTML if it doesn't exist
  function ensureSettingsModalExists() {
    let overlay = document.getElementById('settingsModalOverlay');
    
    if (!overlay) {
      // Settings modal создаётся в HTML, но если его нет - можно создать базовую версию
    } else {
      // Проверка: если overlay существует, убеждаемся что он в body
      if (overlay.parentElement !== document.body) {
        const parent = overlay.parentElement;
        parent.removeChild(overlay);
        document.body.appendChild(overlay);
      }
    }
    
    return !!overlay;
  }

  function applyInterfaceAuraMode(enabled) {
    document.body.classList.toggle('stealth-mode', !enabled);
    document.documentElement.removeAttribute('data-aura-mode');
  }
  window.applyInterfaceAuraMode = applyInterfaceAuraMode;

  // Settings state management (вынесено наружу для глобального доступа)
  function getSettingsState() {
    try {
      const stored = localStorage.getItem('tendai_settings');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      // Failed to load settings from localStorage
    }
    // Default values
    return {
      dailyCheckinsEnabled: true,
      remindersEnabled: true,
      language: 'en',
      interfaceGlowEnabled: true
    };
  }
  
  function saveSettingsState(settings) {
    try {
      localStorage.setItem('tendai_settings', JSON.stringify(settings));
    } catch (e) {
      // Failed to save settings to localStorage
    }
  }
  
  function restoreSettingsState() {
    const settings = getSettingsState();
    const dailyCheckins = document.getElementById('settingsDailyCheckins');
    const reminders = document.getElementById('settingsNotifications');
    const language = document.getElementById('settingsLanguage');
    
    if (dailyCheckins) {
      dailyCheckins.checked = settings.dailyCheckinsEnabled !== false;
    }
    if (reminders) {
      reminders.checked = settings.remindersEnabled !== false;
    }
    if (language) {
      language.value = settings.language || 'en';
    }
    const autoProfileQuestions = document.getElementById('settingsAutoProfileQuestions');
    if (autoProfileQuestions) {
      autoProfileQuestions.checked = settings.autoProfileQuestionsEnabled !== false;
    }
    const autoHealthChecks = document.getElementById('settingsAutoHealthChecks');
    if (autoHealthChecks) {
      autoHealthChecks.checked = settings.autoHealthChecksEnabled !== false;
    }
    var theme = localStorage.getItem('tendai-theme');
    var graph = document.getElementById('settingsGraphiteTheme');
    if (graph) graph.checked = (theme === 'graphite');

    const demoMode = document.getElementById('settingsDemoMode');
    if (demoMode) demoMode.checked = getState().demo?.isDemoMode === true;

    const auraGlow = document.getElementById('settingsAuraGlow');
    if (auraGlow) {
      auraGlow.checked = settings.interfaceGlowEnabled !== false;
    }
    applyInterfaceAuraMode(settings.interfaceGlowEnabled !== false);

    // Restore location settings
    const profile = profileState.get();
    const location = profile.location;
    const locationCountry = document.getElementById('settingsLocationCountry');
    const locationCity = document.getElementById('settingsLocationCity');
    const locationStatus = document.getElementById('settingsLocationStatus');
    
    if (locationCountry && location) {
      locationCountry.value = location.country || '';
    }
    if (locationCity && location) {
      locationCity.value = location.city || location.zip || '';
    }
    if (locationStatus) {
      if (location && location.type === 'manual') {
        const locationStr = location.city || location.zip || '';
        locationStatus.textContent = `Current: ${locationStr}${location.country ? `, ${location.country}` : ''}`;
        locationStatus.style.color = 'var(--gold)';
      } else if (location && location.type === 'geo') {
        locationStatus.textContent = 'Using browser location';
        locationStatus.style.color = 'var(--fg-soft)';
      } else {
        locationStatus.textContent = 'No location set';
        locationStatus.style.color = 'var(--fg-muted)';
      }
    }
  }
  
  // Track if handlers are already set up to avoid duplicates
  let settingsHandlersSetup = false;
  
  function setupSettingsHandlers() {
    if (settingsHandlersSetup) {
      return; // Already set up, avoid duplicate listeners
    }
    
    const dailyCheckins = document.getElementById('settingsDailyCheckins');
    const reminders = document.getElementById('settingsNotifications');
    const language = document.getElementById('settingsLanguage');
    
    if (dailyCheckins) {
      dailyCheckins.addEventListener('change', function(e) {
        const settings = getSettingsState();
        settings.dailyCheckinsEnabled = e.target.checked;
        saveSettingsState(settings);
      });
    }
    
    if (reminders) {
      reminders.addEventListener('change', function(e) {
        const settings = getSettingsState();
        settings.remindersEnabled = e.target.checked;
        saveSettingsState(settings);
      });
    }
    
    if (language) {
      language.addEventListener('change', function(e) {
        const settings = getSettingsState();
        settings.language = e.target.value;
        saveSettingsState(settings);
      });
    }
    const autoProfileQuestions = document.getElementById('settingsAutoProfileQuestions');
    if (autoProfileQuestions) {
      autoProfileQuestions.addEventListener('change', function(e) {
        const settings = getSettingsState();
        settings.autoProfileQuestionsEnabled = e.target.checked;
        saveSettingsState(settings);
      });
    }
    const autoHealthChecks = document.getElementById('settingsAutoHealthChecks');
    if (autoHealthChecks) {
      autoHealthChecks.addEventListener('change', function(e) {
        const settings = getSettingsState();
        settings.autoHealthChecksEnabled = e.target.checked;
        saveSettingsState(settings);
      });
    }
    const demoModeToggle = document.getElementById('settingsDemoMode');
    if (demoModeToggle) {
      demoModeToggle.addEventListener('change', function(e) {
        const checked = !!e.target.checked;
        updateState({ demo: { isDemoMode: checked } }, 'settings_demo_toggle');
        import('../dev/mock-data-generator.js')
          .then((mod) => {
            if (mod && typeof mod.applyDemoAgentSimulation === 'function') {
              mod.applyDemoAgentSimulation(checked);
            }
          })
          .catch(() => {});
        if (typeof window.refreshHumanOsFeed === 'function') window.refreshHumanOsFeed();
      });
    }
    var graphToggle = document.getElementById('settingsGraphiteTheme');
    if (graphToggle && typeof window.applyTheme === 'function' && !window.__themeToggleBound) {
      window.__themeToggleBound = true;
      graphToggle.addEventListener('change', function() {
        var c = !!this.checked;
        window.applyTheme(c ? 'graphite' : 'purple');
      });
    }

    const auraGlowToggle = document.getElementById('settingsAuraGlow');
    if (auraGlowToggle && !window.__auraGlowToggleBound) {
      window.__auraGlowToggleBound = true;
      auraGlowToggle.addEventListener('change', function (e) {
        const checked = !!e.target.checked;
        const next = getSettingsState();
        next.interfaceGlowEnabled = checked;
        saveSettingsState(next);
        applyInterfaceAuraMode(checked);
      });
    }

    // Location settings handlers
    const locationSave = document.getElementById('settingsLocationSave');
    const locationUseGeo = document.getElementById('settingsLocationUseGeo');
    const locationCountry = document.getElementById('settingsLocationCountry');
    const locationCity = document.getElementById('settingsLocationCity');
    const locationStatus = document.getElementById('settingsLocationStatus');
    
    if (locationSave) {
      locationSave.addEventListener('click', async function() {
        const country = locationCountry?.value.trim() || '';
        const cityOrZip = locationCity?.value.trim() || '';
        
        if (!cityOrZip) {
          if (locationStatus) {
            locationStatus.textContent = 'Please enter City or ZIP';
            locationStatus.style.color = 'var(--fg-muted)';
          }
          return;
        }
        
        try {
          if (window.setManualLocation) {
            const locationData = {
              ...(country && { country }),
              ...(/^\d{5}(-\d{4})?$/.test(cityOrZip) ? { zip: cityOrZip } : { city: cityOrZip })
            };
            
            window.setManualLocation(locationData);

            if (locationStatus) {
              locationStatus.textContent = 'Location saved';
              locationStatus.style.color = 'var(--gold)';
            }

            // Invalidate weather cache so next fetch uses new location; then refresh card
            if (typeof window.invalidateWeatherCache === 'function') {
              window.invalidateWeatherCache();
            }
            if (window.updateFeedUI) {
              setTimeout(() => window.updateFeedUI(), 500);
            }
            
            // Update status display
            setTimeout(() => {
              restoreSettingsState();
            }, 100);
          }
        } catch (error) {
          console.error('[SETTINGS] Error saving location:', error);
          if (locationStatus) {
            locationStatus.textContent = 'Error saving location';
            locationStatus.style.color = 'var(--fg-muted)';
          }
        }
      });
    }
    
    if (locationUseGeo) {
      locationUseGeo.addEventListener('click', async function() {
        if (locationStatus) {
          locationStatus.textContent = 'Requesting location...';
          locationStatus.style.color = 'var(--fg-soft)';
        }
        
        try {
          if (window.requestGeolocation) {
            const geoLocation = await window.requestGeolocation();
            if (geoLocation) {
              if (locationStatus) {
                locationStatus.textContent = 'Location saved';
                locationStatus.style.color = 'var(--gold)';
              }
              
              // Refresh weather after saving
              if (window.updateFeedUI) {
                setTimeout(() => window.updateFeedUI(), 500);
              }
              
              // Update status display
              setTimeout(() => {
                restoreSettingsState();
              }, 100);
            } else {
              if (locationStatus) {
                locationStatus.textContent = 'Location not available';
                locationStatus.style.color = 'var(--fg-muted)';
              }
            }
          }
        } catch (error) {
          console.error('[SETTINGS] Error getting geolocation:', error);
          if (locationStatus) {
            locationStatus.textContent = 'Location access denied or unavailable';
            locationStatus.style.color = 'var(--fg-muted)';
          }
        }
      });
    }
    
    settingsHandlersSetup = true;
  }

  // Settings Modal handlers
  function initSettingsModal() {
    ensureSettingsModalExists();
    
    const settingsModalOverlay = document.getElementById('settingsModalOverlay');
    const settingsModal = document.getElementById('settingsModal');
    const settingsModalClose = document.getElementById('settingsModalClose');

    if (!settingsModalOverlay || !settingsModal) {
      return;
    }

    // Function to open Settings modal
    // Экспортируем как именованную функцию для проверки typeof
    function openSettingsModal() {
      if (settingsModalOverlay) {
        var t = localStorage.getItem('tendai-theme');
        if (typeof window.applyTheme === 'function') window.applyTheme(t === 'graphite' ? 'graphite' : 'purple');
        restoreSettingsState();
        settingsModalOverlay.classList.add('is-active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
          setupSettingsHandlers();
        }, 50);
      }
    }
    
    // Экспортируем в window
    window.openSettingsModal = openSettingsModal;

    // Function to close Settings modal
    window.closeSettingsModal = function() {
      if (settingsModalOverlay) {
        settingsModalOverlay.classList.remove('is-active');
        document.body.style.overflow = '';
      }
    };

    // Close button handler
    // Файл: profile-modals.js, строка ~1115
    // Зачем: Закрытие Settings модалки по кнопке X
    // Защита: работает только внутри модалки, не мешает [data-section]
    if (settingsModalClose) {
      settingsModalClose.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        e.stopPropagation();
        window.closeSettingsModal();
      });
    }

    // Overlay click handler
    // Файл: profile-modals.js, строка ~1123
    // Зачем: Закрытие Settings модалки по клику на overlay
    // Защита: работает только внутри overlay, не мешает [data-section]
    if (settingsModalOverlay) {
      settingsModalOverlay.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        if (e.target === settingsModalOverlay) {
          window.closeSettingsModal();
        }
      });
    }

    // Prevent modal content clicks from closing
    // Файл: profile-modals.js, строка ~1133
    // Зачем: Предотвращение закрытия при клике внутри Settings модалки
    // Защита: работает только внутри модалки, не мешает [data-section]
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        // Защита: не трогаем клики по [data-section]
        if (e.target.closest('[data-section]')) return;
        // Row actions are handled by the document-level handler (setupUniversalClickHandler).
        if (e.target.closest('#settingsEditProfile, #settingsSendLogToDev, #settingsPrivacyPolicy, #settingsTermsOfUse, #settingsConnectSources, #settingsSendFeedback, #settingsRateApp, #settingsDeleteData')) return;
        e.stopPropagation();
      });
    }
  }

  // Initialize Settings modal
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSettingsModal();
      // Restore settings state on page load
      restoreSettingsState();
      setupSettingsHandlers();
    });
  } else {
    initSettingsModal();
    // Restore settings state on page load
    restoreSettingsState();
    setupSettingsHandlers();
  }

  // Initialize profile UI on load
  function initProfileUI() {
    updateProfileUI();
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfileUI);
  } else {
    initProfileUI();
  }

})();

