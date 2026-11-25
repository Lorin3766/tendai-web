// Serron — Services State
// @owner: services
// @role: state (Labs, Online Doctor, Programs)
// Unified data source for mobile SERVICES tab and desktop right panel

export const servicesState = {
  labs: [
    { id: 'blood-test', name: 'Blood test', icon: '🩸' },
    { id: 'cholesterol', name: 'Cholesterol', icon: '🧪' },
    { id: 'hormones', name: 'Hormones', icon: '💊' },
    { id: 'full-check', name: 'Full check', icon: '📋' }
  ],

  onlineDoctor: [
    {
      id: 'chat',
      name: 'Chat with doctor',
      description: 'Text consultation',
      icon: '💬'
    },
    {
      id: 'voice',
      name: 'Voice call',
      description: 'Audio consultation',
      icon: '📞'
    },
    {
      id: 'video',
      name: 'Video call',
      description: 'Video consultation',
      icon: '📹'
    }
  ],

  miniPrograms: [
    {
      id: 'create-my-plan',
      name: 'Create my plan',
      days: 0,
      icon: '📋'
    }
  ],

  // Get all labs
  getLabs() {
    return this.labs;
  },

  // Get all online doctor options
  getOnlineDoctor() {
    return this.onlineDoctor;
  },

  // Get all mini programs
  getMiniPrograms() {
    return this.miniPrograms;
  },

  // Get lab by id
  getLabById(id) {
    return this.labs.find(lab => lab.id === id);
  },

  // Get online doctor option by id
  getOnlineDoctorById(id) {
    return this.onlineDoctor.find(option => option.id === id);
  },

  // Get mini program by id
  getMiniProgramById(id) {
    return this.miniPrograms.find(program => program.id === id);
  }
};

