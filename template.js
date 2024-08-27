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
const Math = require('Math');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const encodeUriComponent = require('encodeUriComponent');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;

const eventData = getAllEventData();

const apiVersion = '2.0';
const postUrl = 'https://ads-api.reddit.com/api/v' + apiVersion + '/conversions/events/' + enc(data.accountId);
const eventType = getEventType(eventData, data);
const eventName = eventType.tracking_type === 'Custom' ? eventType.custom_event_name : eventType.tracking_type;
const postBody = mapEvent(eventData, data);
const url = eventData.page_location || getRequestHeader('referer');

const deprecatedCookie = getCookieValues('rdt_cid')[0];
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
let rdtcid = deprecatedCookie || getCookieValues('_rdt_cid')[0] || eventData.rdt_cid;

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

if (isLoggingEnabled) {
  logToConsole(
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
}

sendHttpRequest(
  postUrl,
  (statusCode, headers, body) => {
    if (isLoggingEnabled) {
      logToConsole(
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
    }
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

function mapEvent(eventData, data) {
  let mappedData = {
    event_type: eventType,
    event_at: data.eventAt ? data.eventAt : convertToRFC3339UsingMath(getTimestampMillis())
  };

  if (data.clickId) {
    mappedData.click_id = data.clickId;
  } else if (rdtcid) {
    mappedData.click_id = rdtcid;
  }

  mappedData = addUserData(eventData, mappedData);
  mappedData = addPropertiesData(eventData, mappedData);

  return {
    events: [mappedData],
    test_mode: data.testMode
  };
}

function addPropertiesData(eventData, mappedData) {
  mappedData.event_metadata = {};

  if (eventData.event_id) mappedData.event_metadata.conversion_id = eventData.event_id;
  else if (eventData.transaction_id) mappedData.event_metadata.conversion_id = eventData.transaction_id;

  if (eventData.currency) mappedData.event_metadata.currency = eventData.currency;
  if (eventData.item_count) mappedData.event_metadata.item_count = eventData.item_count;

  if (eventData.value) mappedData.event_metadata.value_decimal = makeNumber(eventData.value);
  else if (eventData['x-ga-mp1-ev']) mappedData.event_metadata.value_decimal = makeNumber(eventData['x-ga-mp1-ev']);
  else if (eventData['x-ga-mp1-tr']) mappedData.event_metadata.value_decimal = makeNumber(eventData['x-ga-mp1-tr']);

  if (eventData.products) mappedData.event_metadata.products = eventData.products;
  else if (eventData.items && eventData.items[0]) {
    mappedData.event_metadata.products = [];

    eventData.items.forEach((d, i) => {
      let item = {};

      if (d.item_id) item.id = d.item_id;
      else if (d.id) item.id = d.id;

      if (d.content_category) item.category = d.content_category;
      else if (d.category) item.category = d.category;

      if (d.content_name) item.name = d.content_name;
      else if (d.name) item.name = d.name;

      mappedData.event_metadata.products.push(item);
    });
  }

  if (data.serverEventDataList) {
    data.serverEventDataList.forEach((d) => {
      mappedData.event_metadata[d.name] = d.value;
    });
  }

  return mappedData;
}

function addUserData(eventData, mappedData) {
  let userEventData = {};
  mappedData.user = {};

  if (getType(eventData.user_data) === 'object') {
    userEventData = eventData.user_data || eventData.user_properties || eventData.user;
  }
  const uuid = getUUIDFromCookie() || eventData.rdt_uuid;
  if (uuid) mappedData.user.uuid = uuid;
  if (eventData.aaid) mappedData.user.aaid = eventData.aaid;
  else if (userEventData.aaid) mappedData.user.aaid = userEventData.aaid;

  if (eventData.email) mappedData.user.email = eventData.email;
  else if (eventData.email_address) mappedData.user.email = eventData.email_address;
  else if (userEventData.email) mappedData.user.email = userEventData.email;
  else if (userEventData.email_address) mappedData.user.email = userEventData.email_address;
  else if (getCookieValues('_rdt_em')[0]) mappedData.user.email = getCookieValues('_rdt_em')[0];

  if (eventData.external_id) mappedData.user.external_id = eventData.external_id;
  else if (eventData.user_id) mappedData.user.external_id = eventData.user_id;
  else if (eventData.userId) mappedData.user.external_id = eventData.userId;
  else if (userEventData.external_id) mappedData.user.external_id = userEventData.external_id;

  if (eventData.idfa) mappedData.user.idfa = eventData.idfa;
  else if (userEventData.idfa) mappedData.user.idfa = userEventData.idfa;

  if (eventData.ip_override) mappedData.user.ip_address = eventData.ip_override;
  else if (eventData.ip_address) mappedData.user.ip_address = eventData.ip_address;
  else if (eventData.ip) mappedData.user.ip_address = eventData.ip;

  if (eventData.opt_out) mappedData.user.opt_out = eventData.opt_out;
  if (eventData.user_agent) mappedData.user.user_agent = eventData.user_agent;

  if (eventData.viewport_size && eventData.viewport_size.split('x').length === 2) {
    mappedData.user.screen_dimensions = {
      width: eventData.viewport_size.split('x')[0],
      height: eventData.viewport_size.split('x')[1]
    };
  } else if (eventData.height && eventData.width) {
    mappedData.user.screen_dimensions = {
      height: eventData.height,
      width: eventData.width
    };
  }

  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      mappedData.user[d.name] = d.value;
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
      page_view: 'PageVisit',
      click: 'Lead',
      download: 'Lead',
      file_download: 'Lead',
      complete_registration: 'SignUp',
      'gtm.dom': 'PageVisit',
      add_payment_info: 'Lead',
      add_to_cart: 'AddToCart',
      add_to_wishlist: 'AddToWishlist',
      sign_up: 'SignUp',
      begin_checkout: 'Lead',
      generate_lead: 'Lead',
      purchase: 'Purchase',
      search: 'Search',
      view_item: 'ViewContent',

      contact: 'Lead',
      find_location: 'Search',
      submit_application: 'Lead',
      subscribe: 'Lead',

      'gtm4wp.addProductToCartEEC': 'AddToCart',
      'gtm4wp.productClickEEC': 'ViewContent',
      'gtm4wp.checkoutOptionEEC': 'Lead',
      'gtm4wp.checkoutStepEEC': 'Lead',
      'gtm4wp.orderCompletedEEC': 'Purchase'
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
  if (data.eventNameCustom == 'Purchase' || data.eventNameCustom == 'SignUp') {
    return {
      tracking_type: data.eventNameCustom
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

function enc(data) {
  data = data || '';
  return encodeUriComponent(data);
}

function convertToRFC3339UsingMath(milliseconds) {
    // Constants
    const msPerSecond = 1000;
    const msPerMinute = 60 * msPerSecond;
    const msPerHour = 60 * msPerMinute;
    const msPerDay = 24 * msPerHour;

    // Calculate the number of days since epoch
    let daysSinceEpoch = Math.floor(milliseconds / msPerDay);

    // Calculate the number of milliseconds remaining after the full days are accounted for
    let remainingMilliseconds = milliseconds % msPerDay;

    // Calculate the UTC hours, minutes, seconds, and milliseconds
    let hours = Math.floor(remainingMilliseconds / msPerHour);
    remainingMilliseconds = remainingMilliseconds % msPerHour;

    let minutes = Math.floor(remainingMilliseconds / msPerMinute);
    remainingMilliseconds = remainingMilliseconds % msPerMinute;

    let seconds = Math.floor(remainingMilliseconds / msPerSecond);

    // Calculate the date (year, month, day) from the number of days since epoch
    let year = 1970;
    let month = 1;

    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    while (daysSinceEpoch >= 365) {
        if (isLeapYear(year)) {
            if (daysSinceEpoch >= 366) {
                daysSinceEpoch = daysSinceEpoch - 366;
                year++;
            }
        } else {
            daysSinceEpoch = daysSinceEpoch - 365;
            year++;
        }
    }

    while (daysSinceEpoch >= daysInMonth[month - 1]) {
        if (month === 2 && isLeapYear(year) && daysSinceEpoch >= 29) {
            daysSinceEpoch = daysSinceEpoch - 29;
        } else {
            daysSinceEpoch = daysSinceEpoch - daysInMonth[month - 1];
        }
        month++;
    }

    let day = daysSinceEpoch + 1;

    // Helper function to check if a year is a leap year
    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    }

    // Format components to ensure two digits where needed
    const pad = (n) => n < 10 ? '0' + n : n;

    // Construct the RFC 3339 timestamp
    const rfc3339Timestamp = year + '-' + pad(month) + '-' + pad(day) + 'T' + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds) + 'Z';

    return rfc3339Timestamp;
}