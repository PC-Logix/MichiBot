const fs = require('fs');
const path = require('path');

let permissions = { users: [] }; // Initialize with default values

// Function to load permissions from permissions.json
const loadPermissions = () => {
  const permissionsPath = path.join(__dirname, '..', 'permissions.json');
  try {
    const permissionsData = fs.readFileSync(permissionsPath, 'utf8');
    console.log('Loaded permissions data:', permissionsData);
    return JSON.parse(permissionsData);
  } catch (error) {
    console.error('Error loading permissions:', error.message);
    return { users: [] };
  }
};

// Function to save permissions to permissions.json
const savePermissions = () => {
  const permissionsPath = path.join(__dirname, '..', 'permissions.json');
  try {
    fs.writeFileSync(permissionsPath, JSON.stringify(permissions, null, 2));
  } catch (error) {
    console.error('Error saving permissions:', error.message);
  }
};

module.exports = {
  init: () => {
    permissions = loadPermissions();
  },

  getPermissions: () => permissions,

  savePermissions: savePermissions,

  getAdminUsers: () => {
    return (permissions && permissions.ranks) ? permissions.ranks
      .filter(rank => rank.name === 'Admin')
      .flatMap(rank => rank.users || []) : [];
  },
  

  isAdmin: (user) => {
    return permissions.ranks.some(rankData => rankData.users.includes(user) && rankData.name === 'Admin');
  },
};
