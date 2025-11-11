const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const getRequestHeader = require('getRequestHeader');
const parseUrl = require('parseUrl');
const decodeUriComponent = require('decodeUriComponent');
const getType = require('getType');
const getTimestampMillis = require('getTimestampMillis');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const makeInteger = require('makeInteger');
const encodeUriComponent = require('encodeUriComponent');
const createRegex = require('createRegex');
const testRegex = require('testRegex');
const BigQuery = require('BigQuery');
const makeTableMap = require('makeTableMap');

/**********************************************************************************************/

const isLoggingEnabled = determinateIsLoggingEnabled();
const timestampMillisRegex = createRegex('^[0-9]+$');
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;
const apiVersion = '3';
const eventData = getAllEventData();
const postUrl = 'https://ads-api.reddit.com/api/v' + apiVersion + '/pixels/' + data.pixelId + '/conversion_events';
const eventType = getEventType(eventData, data);
const eventName = eventType.tracking_type === 'Custom' ? eventType.custom_event_name : eventType.tracking_type;
const eventDataMap = data.serverEventDataList ? makeTableMap(data.serverEventDataList, 'name', 'value') : undefined;
const postBody = mapEvent(eventData, data);
const url = eventData.page_location || getRequestHeader('referer');
const deprecatedCookie = getCookieValues('rdt_cid')[0];
let rdtcid = deprecatedCookie || getCookieValues('_rdt_cid')[0] || eventData.rdt_cid;

/*******************************************************
 * Main execution
 * ****************************************************/

if (!isConsentGivenOrNotRequired(data, eventData)) {
  return data.gtmOnSuccess();
}

handleRedditCookie();

sendRedditRequest(postUrl, postBody);

/******************************************************************************
 * Vendor related functions
 * **************************************************************************/

function sendRedditRequest(postUrl, postBody) {
  log(
    JSON.stringify({
      Name: 'Reddit',
      Type: 'Request',
      TraceId: traceId,
      EventName: eventName,
      RequestMethod: 'POST',
      RequestUrl: postUrl,
      RequestBody: postBody
    })
  );

  sendHttpRequest(
    postUrl,
    (statusCode, headers, body) => {
      log(
        JSON.stringify({
          Name: 'Reddit',
          Type: 'Response',
          TraceId: traceId,
          EventName: eventName,
          ResponseStatusCode: statusCode,
          ResponseHeaders: headers,
          ResponseBody: body
        })
      );

      if (!data.useOptimisticScenario) {
        if (statusCode >= 200 && statusCode < 400) {
          data.gtmOnSuccess();
        } else {
          data.gtmOnFailure();
        }
      }
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + data.accessToken
      },
      method: 'POST'
    },
    JSON.stringify(postBody)
  );

  if (data.useOptimisticScenario) {
    data.gtmOnSuccess();
  }
}

function handleRedditCookie() {
  if (deprecatedCookie) {
    setCookie('rdt_cid', '', {
      domain: 'auto',
      path: '/',
      samesite: 'Lax',
      secure: true,
      'max-age': 0,
      httpOnly: false
    });
  }

  if (url) {
    const urlParsed = parseUrl(url);

    if (urlParsed && urlParsed.searchParams.rdt_cid) {
      rdtcid = decodeUriComponent(urlParsed.searchParams.rdt_cid);
    }
  }

  if (rdtcid) {
    setCookie('_rdt_cid', rdtcid, {
      domain: 'auto',
      path: '/',
      samesite: 'Lax',
      secure: true,
      'max-age': 2592000, // 30 days
      httpOnly: false
    });
  }
}

function mapEvent(eventData, data) {
  let mappedData = {
    type: eventType,
    event_at: getTimestampMillis(),
    action_source: 'WEBSITE',
    metadata: {}
  };

  if (data.eventAtMs) {
    mappedData.event_at = testRegex(timestampMillisRegex, makeString(data.eventAtMs)) ? mappedData.event_at : convertISOToTimeMs(data.eventAtMs);
  }

  if (data.clickId) {
    mappedData.click_id = data.clickId;
  } else if (rdtcid) {
    mappedData.click_id = rdtcid;
  }

  mappedData = addUserData(eventData, mappedData);

  mappedData = addPropertiesData(eventData, mappedData);

  return {
    data: {
      test_id: data.testId,
      events: [mappedData]
    }
  };
}

function addPropertiesData(eventData, mappedData) {
  if (eventData.event_id) mappedData.metadata.conversion_id = makeString(eventData.event_id);
  else if (eventData.transaction_id) mappedData.metadata.conversion_id = makeString(eventData.transaction_id);
  else if (eventDataMap.conversion_id) mappedData.metadata.conversion_id = makeString(eventDataMap.conversion_id);

  if (eventData.currency) mappedData.metadata.currency = eventData.currency;
  else if (eventDataMap.currency) mappedData.metadata.currency = eventDataMap.currency;

  if (eventData.item_count) mappedData.metadata.item_count = eventData.item_count;
  else if (eventDataMap.item_count) mappedData.metadata.item_count = eventDataMap.item_count;

  if (isValidValue(eventData.value)) mappedData.metadata.value = makeNumber(eventData.value);
  else if (isValidValue(eventData['x-ga-mp1-ev'])) mappedData.metadata.value = makeNumber(eventData['x-ga-mp1-ev']);
  else if (isValidValue(eventData['x-ga-mp1-tr'])) mappedData.metadata.value = makeNumber(eventData['x-ga-mp1-tr']);
  else if (eventDataMap.value) mappedData.metadata.value = makeNumber(eventDataMap.value);

  if (eventData.products) mappedData.metadata.products = eventData.products;
  else if (eventData.items && eventData.items[0]) {
    mappedData.metadata.products = [];

    eventData.items.forEach((product) => {
      let item = {};

      if (product.item_id) item.id = makeString(product.item_id);
      else if (product.id) item.id = makeString(product.id);

      if (product.content_category) item.category = product.content_category;
      else if (product.category) item.category = product.category;
      else if (product.item_category) item.category = product.item_category;

      if (product.content_name) item.name = product.content_name;
      else if (product.name) item.name = product.name;
      else if (product.item_name) item.name = product.item_name;

      mappedData.metadata.products.push(item);
    });
  } else if (getType(eventDataMap.products) === 'array' && eventDataMap.products.length) {
    mappedData.metadata.products = eventDataMap.products;
  }
  return mappedData;
}

function addUserData(eventData, mappedData) {
  const uuid = getUUIDFromCookie() || eventData.rdt_uuid;
  let userEventData = {};
  mappedData.user = {
    data_processing_options: {
      modes: ['LDU']
    }
  };

  if (getType(eventData.user_data) === 'object') {
    userEventData = eventData.user_data || eventData.user_properties || eventData.user;
  }

  if (uuid) mappedData.user.uuid = uuid;

  if (eventData.aaid) mappedData.user.aaid = eventData.aaid;
  else if (userEventData.aaid) mappedData.user.aaid = userEventData.aaid;

  if (eventData.email) mappedData.user.email = eventData.email;
  else if (eventData.email_address) mappedData.user.email = eventData.email_address;
  else if (userEventData.email) mappedData.user.email = userEventData.email;
  else if (userEventData.email_address) mappedData.user.email = userEventData.email_address;
  else if (getCookieValues('_rdt_em')[0]) mappedData.user.email = getCookieValues('_rdt_em')[0];

  if (eventData.phone_number) mappedData.user.phone_number = eventData.phone_number;
  else if (userEventData.phone_number) mappedData.user.phone_number = userEventData.phone_number;

  if (eventData.external_id) mappedData.user.external_id = eventData.external_id;
  else if (eventData.user_id) mappedData.user.external_id = eventData.user_id;
  else if (eventData.userId) mappedData.user.external_id = eventData.userId;
  else if (userEventData.external_id) mappedData.user.external_id = userEventData.external_id;

  if (eventData.idfa) mappedData.user.idfa = eventData.idfa;
  else if (userEventData.idfa) mappedData.user.idfa = userEventData.idfa;

  if (eventData.ip_override) mappedData.user.ip_address = eventData.ip_override;
  else if (eventData.ip_address) mappedData.user.ip_address = eventData.ip_address;
  else if (eventData.ip) mappedData.user.ip_address = eventData.ip;

  if (eventData.user_agent) mappedData.user.user_agent = eventData.user_agent;

  if (eventData.viewport_size && eventData.viewport_size.split('x').length === 2) {
    mappedData.user.screen_dimensions = {
      width: makeInteger(eventData.viewport_size.split('x')[0]),
      height: makeInteger(eventData.viewport_size.split('x')[1])
    };
  } else if (eventData.height && eventData.width) {
    mappedData.user.screen_dimensions = {
      height: makeInteger(eventData.height),
      width: makeInteger(eventData.width)
    };
  }

  if (data.userDataList) {
    data.userDataList.forEach((userProperty) => {
      mappedData.user[userProperty.name] = userProperty.value;
    });
  }

  return mappedData;
}

function getUUIDFromCookie() {
  const uuidsWithTimestamps = getCookieValues('_rdt_uuid');
  if (!uuidsWithTimestamps || !uuidsWithTimestamps.length) return null;
  let oldest = null;
  for (let i = 0; i < uuidsWithTimestamps.length; i++) {
    const current = getUUIDAndTimestamp(uuidsWithTimestamps[i]);
    if (!current) continue;
    if (!oldest || current.timestamp < oldest.timestamp) oldest = current;
  }
  return oldest && oldest.uuid;
}

function getUUIDAndTimestamp(uuidWithTimestamp) {
  if (!uuidWithTimestamp) return null;
  const parts = uuidWithTimestamp.split('.');
  if (parts.length !== 2) return null;

  return {
    timestamp: makeNumber(parts[0]),
    uuid: makeString(parts[1])
  };
}

function getEventType(eventData, data) {
  if (data.eventType === 'inherit') {
    let eventName = eventData.event_name;

    let gaToEventName = {
      page_view: 'PAGE_VISIT',
      click: 'LEAD',
      download: 'LEAD',
      file_download: 'LEAD',
      complete_registration: 'SIGN_UP',
      'gtm.dom': 'PAGE_VISIT',
      add_payment_info: 'LEAD',
      add_to_cart: 'ADD_TO_CART',
      add_to_wishlist: 'ADD_TO_WISHLIST',
      sign_up: 'SIGN_UP',
      begin_checkout: 'LEAD',
      generate_lead: 'LEAD',
      purchase: 'PURCHASE',
      search: 'SEARCH',
      view_item: 'VIEW_CONTENT',
      contact: 'LEAD',
      find_location: 'SEARCH',
      submit_application: 'LEAD',
      subscribe: 'LEAD',

      'gtm4wp.addProductToCartEEC': 'ADD_TO_CART',
      'gtm4wp.productClickEEC': 'VIEW_CONTENT',
      'gtm4wp.checkoutOptionEEC': 'LEAD',
      'gtm4wp.checkoutStepEEC': 'LEAD',
      'gtm4wp.orderCompletedEEC': 'PURCHASE'
    };

    if (!gaToEventName[eventName]) {
      return {
        tracking_type: 'Custom',
        custom_event_name: eventName
      };
    }

    return {
      tracking_type: gaToEventName[eventName]
    };
  }

  if (data.eventType === 'custom') {
    return {
      tracking_type: 'Custom',
      custom_event_name: data.eventNameCustom
    };
  }

  return {
    tracking_type: data.eventName
  };
}

/**************************************************************************
 * Helpers
 * ************************************************************************/

function enc(data) {
  return encodeUriComponent(data || '');
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled()) logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery()) logDestinationsHandlers.bigQuery = logToBigQuery;

  rawDataToLog.TraceId = getRequestHeader('trace-id');

  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;

    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key;
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  dataToLog.timestamp = getTimestampMillis();

  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  BigQuery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(containerVersion && (containerVersion.debugMode || containerVersion.previewMode));

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}

function convertISOToTimeMs(dateTime) {
  const leapYear = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const nonLeapYear = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dateArray = dateTime.split('T')[0].split('-');
  const timeArray = dateTime.split('T')[1].split(':');

  const year = makeInteger(dateArray[0]);
  const month = makeInteger(dateArray[1]);
  const day = makeInteger(dateArray[2]);
  const hour = makeInteger(timeArray[0]);
  const minutes = makeInteger(timeArray[1]);
  const seconds = makeInteger(timeArray[2]);

  let yearCounter = 1970;
  let unixTime = 0;

  while (yearCounter < year) {
    if (yearCounter % 4 === 0) {
      unixTime += 31622400;
    } else {
      unixTime += 31536000;
    }
    yearCounter++;
  }

  const monthList = yearCounter % 4 === 0 ? leapYear : nonLeapYear;

  let monthCounter = 1;
  while (monthCounter < month) {
    unixTime += monthList[monthCounter - 1] * 86400;
    monthCounter++;
  }

  let dayCounter = 1;
  while (dayCounter < day) {
    unixTime += 86400;
    dayCounter++;
  }

  let hourCounter = 0;
  while (hourCounter < hour) {
    unixTime += 3600;
    hourCounter++;
  }

  let minutesCounter = 0;
  while (minutesCounter < minutes) {
    unixTime += 60;
    minutesCounter++;
  }

  let secondsCounter = 0;
  while (secondsCounter < seconds) {
    unixTime += 1;
    secondsCounter++;
  }

  return unixTime * 1000; //milliseconds;
}
