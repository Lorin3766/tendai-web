// TendAI Mobile — LLM Integration
// @owner: talk
// @role: utils

/**
 * Get backend URL from environment or use default
 * @returns {string} Backend URL
 */
function getBackendURL() {
  // Check for environment variable or use default
  // In production, this can be set via build process or config
  if (typeof window !== 'undefined' && window.TENDAI_BACKEND_URL) {
    return window.TENDAI_BACKEND_URL;
  }
  // Default to localhost for development
  // Try to detect if we're running on a different host/port
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // If running on localhost, use localhost:3000 for backend
  // Otherwise, try to use the same host/port
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  
  // For production or other hosts, use the same protocol and host
  // Backend should be on the same domain or configured separately
  return `${protocol}//${hostname}:3000`;
}

/**
 * Send message to backend LLM proxy
 * @param {string} text - User message
 * @returns {Promise<string>} - AI reply
 */
export async function sendMessageToLLM(text) {
  const BACKEND_URL = getBackendURL();
  const API_URL = `${BACKEND_URL}/api/talk`;

  // Validate input
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }

  if (text.length > 2000) {
    throw new Error('Message is too long (max 2000 characters)');
  }

  // Create abort controller for timeout (fallback for browsers without AbortSignal.timeout)
  const abortController = new AbortController();
  let timeoutId;
  
  try {
    timeoutId = setTimeout(() => abortController.abort(), 60000); // 60 second timeout
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: text.trim() }),
      signal: abortController.signal,
    });
    
    // Clear timeout if request completes successfully
    if (timeoutId) clearTimeout(timeoutId);

    // Check if response is ok
    if (!response.ok) {
      let errorMessage = 'Unable to get response from TendAI';
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || `Server returned ${response.status}`;
      }
      
      throw new Error(errorMessage);
    }

    // Parse response
    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('Invalid response format from server');
    }
    
    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response from server');
    }
    
    if (!data.reply || typeof data.reply !== 'string') {
      throw new Error('No reply in response from TendAI');
    }

    return data.reply.trim();
  } catch (error) {
    // Clear timeout on error
    if (timeoutId) clearTimeout(timeoutId);
    
    // Handle AbortError (timeout)
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error('The request took too long. Please try again.');
    }
    
    // Handle network errors
    if (error.message.includes('Failed to fetch') || 
        error.message.includes('NetworkError') ||
        error.message.includes('Network request failed') ||
        error.message.includes('fetch')) {
      throw new Error('I\'m having trouble connecting right now. Please check your internet connection and try again.');
    }
    
    // Handle CORS errors
    if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
      throw new Error('Connection blocked. Please check backend CORS settings.');
    }
    
    // Return the error message if it's already user-friendly
    if (error.message && 
        !error.message.includes('TypeError') && 
        !error.message.includes('SyntaxError') &&
        error.message.length > 0) {
      throw error;
    }
    
    // Generic fallback
    throw new Error('Something went wrong. Please try again in a moment.');
  }
}

