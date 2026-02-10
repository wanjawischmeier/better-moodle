/**
 * Chrome XMLHttpRequest implementation for GM.xmlHttpRequest
 */

export const chromeXhr = {
  /**
   * Make a cross-origin request
   * @param {Object} details - Request details
   * @returns {Object} Request object with abort method
   */
  xmlHttpRequest: (details) => {
    const {
      method = 'GET',
      url,
      headers = {},
      data,
      responseType = 'text',
      onload,
      onerror,
      onabort,
      ontimeout,
      onprogress,
      onreadystatechange,
      timeout = 0,
      user,
      password,
      overrideMimeType,
      binary = false,
      context,
      anonymous = false
    } = details;

    const xhr = new XMLHttpRequest();
    let aborted = false;

    // Configure request
    xhr.open(method, url, true, user, password);

    // Set response type
    if (responseType === 'arraybuffer' || responseType === 'blob') {
      xhr.responseType = responseType;
    }

    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    // Override MIME type if specified
    if (overrideMimeType) {
      xhr.overrideMimeType(overrideMimeType);
    }

    // Set timeout
    if (timeout > 0) {
      xhr.timeout = timeout;
    }

    // Handle onload
    if (onload) {
      xhr.onload = function() {
        onload({
          status: xhr.status,
          statusText: xhr.statusText,
          responseText: xhr.responseText,
          response: xhr.response,
          responseHeaders: xhr.getAllResponseHeaders(),
          finalUrl: xhr.responseURL,
          context
        });
      };
    }

    // Handle onerror
    if (onerror) {
      xhr.onerror = function() {
        onerror({
          status: xhr.status,
          statusText: xhr.statusText,
          responseText: xhr.responseText,
          responseHeaders: xhr.getAllResponseHeaders(),
          finalUrl: xhr.responseURL,
          error: 'Network error',
          context
        });
      };
    }

    // Handle onabort
    if (onabort) {
      xhr.onabort = function() {
        aborted = true;
        onabort({
          status: xhr.status,
          statusText: 'aborted',
          context
        });
      };
    }

    // Handle ontimeout
    if (ontimeout) {
      xhr.ontimeout = function() {
        ontimeout({
          status: xhr.status,
          statusText: 'timeout',
          context
        });
      };
    }

    // Handle onprogress
    if (onprogress) {
      xhr.onprogress = function(event) {
        onprogress({
          loaded: event.loaded,
          total: event.total,
          lengthComputable: event.lengthComputable,
          context
        });
      };
    }

    // Handle onreadystatechange
    if (onreadystatechange) {
      xhr.onreadystatechange = function() {
        onreadystatechange({
          readyState: xhr.readyState,
          status: xhr.status,
          statusText: xhr.statusText,
          responseText: xhr.responseText,
          responseHeaders: xhr.getAllResponseHeaders(),
          context
        });
      };
    }

    // Send request
    try {
      xhr.send(data || null);
    } catch (error) {
      if (onerror) {
        onerror({
          status: 0,
          statusText: 'exception',
          error: error.message,
          context
        });
      }
    }

    // Return abort function
    return {
      abort: () => {
        if (!aborted) {
          xhr.abort();
        }
      }
    };
  }
};
