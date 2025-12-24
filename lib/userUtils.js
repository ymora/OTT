/**
 * Utilitaires pour la gestion des utilisateurs
 */

/**
 * Vérifie si un utilisateur est administrateur
 * @param {Object} user - Objet utilisateur
 * @returns {boolean} true si l'utilisateur est admin
 */
export function isAdmin(user) {
  if (!user) return false
  return user.role_name === 'admin' || 
         user.role === 'admin' || 
         (Array.isArray(user.roles) && user.roles.includes('admin'))
}

/**
 * Vérifie si un utilisateur a un rôle spécifique
 * @param {Object} user - Objet utilisateur
 * @param {string} role - Rôle à vérifier
 * @returns {boolean} true si l'utilisateur a le rôle
 */
export function hasRole(user, role) {
  if (!user) return false
  return user.role_name === role || 
         user.role === role || 
         (Array.isArray(user.roles) && user.roles.includes(role))
}


