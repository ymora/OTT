'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function FirmwareUploadPage() {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const [file, setFile] = useState(null)
  const [version, setVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [isStable, setIsStable] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const isAdmin = user?.role_name === 'admin'

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      // Vérifier que c'est un fichier .bin
      if (!selectedFile.name.endsWith('.bin')) {
        setError('Le fichier doit être un fichier .bin')
        setFile(null)
        return
      }
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!isAdmin) {
      setError('Seuls les administrateurs peuvent uploader des firmwares')
      return
    }

    if (!file) {
      setError('Veuillez sélectionner un fichier firmware')
      return
    }

    if (!version.trim()) {
      setError('Veuillez saisir une version (ex: 1.0.0)')
      return
    }

    // Validation du format de version (semver)
    const versionRegex = /^\d+\.\d+\.\d+$/
    if (!versionRegex.test(version.trim())) {
      setError('Le format de version doit être X.Y.Z (ex: 1.0.0)')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('firmware', file)
      formData.append('version', version.trim())
      formData.append('release_notes', releaseNotes.trim())
      formData.append('is_stable', isStable ? 'true' : 'false')

      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Token d\'authentification manquant')
      }

      const response = await fetch(`${API_URL}/api.php/firmwares`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de l\'upload')
      }

      setSuccess(`✅ Firmware v${version} uploadé avec succès !`)
      // Réinitialiser le formulaire
      setFile(null)
      setVersion('')
      setReleaseNotes('')
      setIsStable(false)
      // Réinitialiser l'input file
      const fileInput = document.getElementById('firmware-file')
      if (fileInput) fileInput.value = ''
    } catch (err) {
      console.error('Erreur upload firmware:', err)
      setError(err.message || 'Erreur lors de l\'upload du firmware')
    } finally {
      setUploading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">📤 Upload Firmware</h1>
          <p className="text-gray-600 mt-1">Gestion des firmwares OTA</p>
        </div>
        <div className="card">
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
            <p className="text-amber-800 font-semibold mb-1">⚠️ Accès restreint</p>
            <p className="text-amber-700 text-sm">
              Seuls les administrateurs peuvent uploader des firmwares. Veuillez contacter un administrateur si vous avez besoin d'ajouter un nouveau firmware.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">📤 Upload Firmware</h1>
        <p className="text-gray-600 mt-1">Téléverser un nouveau firmware pour les dispositifs OTT</p>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fichier firmware (.bin) *
            </label>
            <input
              id="firmware-file"
              type="file"
              accept=".bin"
              onChange={handleFileChange}
              disabled={uploading}
              className="input"
              required
            />
            {file && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Sélectionnez le fichier firmware compilé (.bin) à uploader
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Version (X.Y.Z) *
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              disabled={uploading}
              className="input"
              required
              pattern="^\d+\.\d+\.\d+$"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Format: X.Y.Z (ex: 1.0.0, 2.1.3)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notes de version (optionnel)
            </label>
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="Corrections de bugs, nouvelles fonctionnalités..."
              disabled={uploading}
              className="input min-h-[100px]"
              rows={4}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Description des changements apportés dans cette version
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_stable"
              checked={isStable}
              onChange={(e) => setIsStable(e.target.checked)}
              disabled={uploading}
              className="h-4 w-4 text-primary-600 dark:text-primary-400 rounded focus:ring-primary-500"
            />
            <label htmlFor="is_stable" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Version stable
            </label>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (Coché = stable, décoché = beta)
            </span>
          </div>

          <div className="bg-gradient-to-r from-amber-50 to-amber-50/50 dark:from-amber-900/20 dark:to-amber-900/10 border-l-4 border-amber-500 dark:border-amber-400 p-4 rounded backdrop-blur-sm">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ Attention</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Assurez-vous que le firmware est compatible avec les dispositifs OTT avant de l'uploader. 
              Un firmware incompatible peut planter les dispositifs de manière irréversible.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              disabled={uploading || !file || !version.trim()}
              className="btn-primary"
            >
              {uploading ? '⏳ Upload en cours...' : '📤 Uploader le firmware'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

