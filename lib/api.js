export async function fetchJson(fetchWithAuth, API_URL, path, options = {}, config = {}) {
  const response = await fetchWithAuth(`${API_URL}${path}`, options, config)
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.error || 'Erreur API')
  }
  return data
}

