<?php
/**
 * Système de cache simple (mémoire) avec support Redis optionnel
 * Utilise un cache en mémoire par défaut, peut être étendu avec Redis
 */

class SimpleCache {
    private static $cache = [];
    private static $redis = null;
    private static $useRedis = false;
    
    /**
     * Initialiser le cache (tenter Redis si disponible)
     */
    public static function init() {
        // Vérifier si Redis est disponible
        $redisHost = getenv('REDIS_HOST') ?: 'localhost';
        $redisPort = getenv('REDIS_PORT') ?: 6379;
        $redisPassword = getenv('REDIS_PASSWORD') ?: null;
        
        if (extension_loaded('redis')) {
            try {
                $redis = new Redis();
                if ($redis->connect($redisHost, $redisPort, 1)) {
                    if ($redisPassword) {
                        $redis->auth($redisPassword);
                    }
                    self::$redis = $redis;
                    self::$useRedis = true;
                    if (getenv('DEBUG_ERRORS') === 'true') {
                        error_log('[Cache] Redis connecté avec succès');
                    }
                }
            } catch (Exception $e) {
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[Cache] Redis non disponible, utilisation du cache mémoire: ' . $e->getMessage());
                }
            }
        }
    }
    
    /**
     * Obtenir une valeur du cache
     */
    public static function get($key) {
        if (self::$useRedis && self::$redis) {
            try {
                $value = self::$redis->get($key);
                if ($value !== false) {
                    return json_decode($value, true);
                }
            } catch (Exception $e) {
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[Cache] Erreur Redis get: ' . $e->getMessage());
                }
            }
        }
        
        // Fallback: cache mémoire
        if (isset(self::$cache[$key])) {
            $item = self::$cache[$key];
            if ($item['expires'] > time()) {
                return $item['value'];
            } else {
                unset(self::$cache[$key]);
            }
        }
        
        return null;
    }
    
    /**
     * Stocker une valeur dans le cache
     */
    public static function set($key, $value, $ttl = 300) {
        if (self::$useRedis && self::$redis) {
            try {
                $serialized = json_encode($value);
                self::$redis->setex($key, $ttl, $serialized);
                return true;
            } catch (Exception $e) {
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[Cache] Erreur Redis set: ' . $e->getMessage());
                }
            }
        }
        
        // Fallback: cache mémoire
        self::$cache[$key] = [
            'value' => $value,
            'expires' => time() + $ttl
        ];
        
        // Nettoyer le cache mémoire si trop volumineux (> 1000 entrées)
        if (count(self::$cache) > 1000) {
            self::cleanup();
        }
        
        return true;
    }
    
    /**
     * Supprimer une clé du cache
     */
    public static function delete($key) {
        if (self::$useRedis && self::$redis) {
            try {
                self::$redis->del($key);
            } catch (Exception $e) {
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[Cache] Erreur Redis delete: ' . $e->getMessage());
                }
            }
        }
        
        unset(self::$cache[$key]);
        return true;
    }
    
    /**
     * Vider le cache
     */
    public static function clear() {
        if (self::$useRedis && self::$redis) {
            try {
                self::$redis->flushDB();
            } catch (Exception $e) {
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[Cache] Erreur Redis clear: ' . $e->getMessage());
                }
            }
        }
        
        self::$cache = [];
        return true;
    }
    
    /**
     * Nettoyer les entrées expirées du cache mémoire
     */
    private static function cleanup() {
        $now = time();
        foreach (self::$cache as $key => $item) {
            if ($item['expires'] <= $now) {
                unset(self::$cache[$key]);
            }
        }
    }
    
    /**
     * Générer une clé de cache à partir de paramètres
     */
    public static function key($prefix, $params = []) {
        $key = $prefix;
        if (!empty($params)) {
            ksort($params);
            $key .= ':' . md5(json_encode($params));
        }
        return $key;
    }
}

// Initialiser le cache au chargement
SimpleCache::init();

