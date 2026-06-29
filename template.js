const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const createRegex = require('createRegex');
const decodeUriComponent = require('decodeUriComponent');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getEventData = require('getEventData');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const testRegex = require('testRegex');

/*==============================================================================
==============================================================================*/

const API_VERSION = '3';
const eventData = getAllEventData();

if (shouldExitEarly(data, eventData)) return;

const rdtcid = getClickId(eventData);
handleClickIdCookie(rdtcid);

const postBody = mapEvent(data, eventData, rdtcid);
sendRedditRequest(postBody);

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function sendRedditRequest(postBody) {
  const requestUrl =
    'https://ads-api.reddit.com/api/v' +
    API_VERSION +
    '/pixels/' +
    enc(data.accountId) +
    '/conversion_events';

  sendHttpRequest(
    requestUrl,
    (statusCode, headers, body) => {
      if (!data.useOptimisticScenario) {
        return statusCode >= 200 && statusCode < 400 ? data.gtmOnSuccess() : data.gtmOnFailure();
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
}

function getClickId(eventData) {
  let rdtcid =
    getCookieValues('rdt_cid')[0] /* Deprecated cookie */ ||
    getCookieValues('_rdt_cid')[0] ||
    eventData._rdt_cid ||
    eventData.rdt_cid;

  const url = getUrl(eventData);
  if (url) {
    const urlParsed = parseUrl(url);
    if (urlParsed && urlParsed.searchParams.rdt_cid) {
      rdtcid = decodeUriComponent(urlParsed.searchParams.rdt_cid);
    }
  }

  return rdtcid;
}

function handleClickIdCookie(rdtcid) {
  const deprecatedCookie = getCookieValues('rdt_cid')[0];
  if (deprecatedCookie) {
    setCookie('rdt_cid', '', {
      domain: getCookieAutoDomain(),
      path: '/',
      samesite: 'Lax',
      secure: true,
      'max-age': 0,
      httpOnly: false
    });
  }

  if (rdtcid) {
    setCookie('_rdt_cid', rdtcid, {
      domain: getCookieAutoDomain(),
      path: '/',
      samesite: 'Lax',
      secure: true,
      'max-age': 2592000, // 30 days
      httpOnly: false
    });
  }
}

function mapEvent(data, eventData, rdtcid) {
  const autoMapEnabled = data.hasOwnProperty('autoMapCommonEventData')
    ? data.autoMapCommonEventData
    : true; // To avoid a breaking change.
  let mappedData = {
    type: getEventType(eventData, data),
    event_at: autoMapEnabled ? getTimestampMillis() : undefined,
    action_source: data.actionSource || 'WEBSITE',
    metadata: {},
    user: {}
  };

  const eventAt = data.eventAt;
  if (eventAt) {
    const timestampMillisRegex = createRegex('^[0-9]+$');
    // Retrocompatibility v2 -> v3
    mappedData.event_at = testRegex(timestampMillisRegex, makeString(eventAt))
      ? makeInteger(eventAt)
      : convertISOToTimeMs(eventAt);
  }

  const clickId = data.clickId || (autoMapEnabled ? rdtcid : undefined);
  if (clickId) {
    mappedData.click_id = clickId;
  }

  if (mappedData.action_source === 'WEBSITE') {
    const eventSourceUrl = data.eventSourceUrl || (autoMapEnabled ? getUrl(eventData) : undefined);
    if (eventSourceUrl) mappedData.event_source_url = eventSourceUrl;
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
  const autoMapEnabled = data.hasOwnProperty('autoMapServerEventData')
    ? data.autoMapServerEventData
    : true; // To avoid a breaking change.

  if (autoMapEnabled) {
    const eventId = eventData.event_id || eventData.transaction_id;
    if (eventId) mappedData.metadata.conversion_id = makeString(eventId);

    if (eventData.currency) mappedData.metadata.currency = eventData.currency;
    if (eventData.item_count) mappedData.metadata.item_count = eventData.item_count;

    const value = eventData.value || eventData['x-ga-mp1-ev'] || eventData['x-ga-mp1-tr'];
    if (isValidValue(value)) mappedData.metadata.value = makeNumber(value);

    let items;
    if (getType(eventData.items) === 'array' && eventData.items.length) items = eventData.items;
    else if (
      getType(eventData.ecommerce) === 'object' &&
      getType(eventData.ecommerce.items) === 'array' &&
      eventData.ecommerce.items.length
    ) {
      items = eventData.ecommerce.items;
    }

    if (eventData.products) mappedData.metadata.products = eventData.products;
    else if (items && items[0]) {
      mappedData.metadata.products = [];

      items.forEach((product) => {
        const item = {};

        const itemId = product.item_id || product.id;
        if (itemId) item.id = makeString(itemId);

        const category = product.content_category || product.category || product.item_category;
        if (category) item.category = category;

        const name = product.content_name || product.name || product.item_name;
        if (name) item.name = name;

        const price = product.price || product.item_price;
        if (price) item.item_price = price;

        if (product.quantity) item.quantity = product.quantity;

        mappedData.metadata.products.push(item);
      });
    }
  }

  if (data.serverEventDataList) {
    data.serverEventDataList.forEach((serverData) => {
      let name = serverData.name;
      let value = serverData.value;
      switch (serverData.name) {
        case 'value_decimal':
        case 'value':
          name = 'value'; // Retrocompatibility v2 -> v3
          value = makeNumber(value);
          break;
      }
      mappedData.metadata[name] = value;
    });
  }

  return mappedData;
}

function addUserData(eventData, mappedData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapUserData') ? data.autoMapUserData : true; // To avoid a breaking change.

  if (autoMapEnabled) {
    let userEventData = {};

    if (getType(eventData.user_data) === 'object') {
      userEventData = eventData.user_data || eventData.user_properties || eventData.user;
    }

    const uuid = getUUIDFromCookie() || eventData._rdt_uuid || eventData.rdt_uuid;
    if (uuid) mappedData.user.uuid = uuid;

    const platform = eventData['x-ga-platform'];

    const aaid =
      eventData.aaid ||
      userEventData.aaid ||
      (platform === 'android' ? eventData['x-ga-resettable_device_id'] : undefined);
    if (aaid && aaid !== '00000000-0000-0000-0000-000000000000') mappedData.user.aaid = aaid;

    const idfa =
      eventData.idfa ||
      userEventData.idfa ||
      (platform === 'ios' ? eventData['x-ga-resettable_device_id'] : undefined);
    if (idfa && idfa !== '00000000-0000-0000-0000-000000000000') mappedData.user.idfa = idfa;

    const email =
      eventData.email ||
      eventData.email_address ||
      userEventData.email ||
      userEventData.email_address ||
      getCookieValues('_rdt_em')[0];
    if (email) mappedData.user.email = email;

    const phone =
      eventData.phone ||
      eventData.phone_number ||
      userEventData.phone ||
      userEventData.phone_number ||
      getCookieValues('_rdt_ph')[0];
    if (phone) mappedData.user.phone_number = phone;

    const externalId =
      eventData.external_id || eventData.user_id || eventData.userId || userEventData.external_id;
    if (externalId) mappedData.user.external_id = externalId;

    const ip = eventData.ip_override || eventData.ip_address || eventData.ip;
    if (ip) mappedData.user.ip_address = ip;

    // Retrocompatibility v2 -> v3
    if (eventData.opt_out) {
      mappedData.user.data_processing_options = {
        modes: ['LDU']
      };
    }

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
  }

  if (data.userDataList) {
    data.userDataList.forEach((userProperty) => {
      // Retrocompatibility v2 -> v3
      if (
        (userProperty.name === 'opt_out' ||
          userProperty.name.indexOf('data_processing_options') !== -1) &&
        userProperty.value
      ) {
        mappedData.user.data_processing_options = mappedData.user.data_processing_options || {
          modes: ['LDU']
        };
        if (userProperty.name === 'opt_out') return;
      }

      const names = userProperty.name.split('.');
      names.reduce((acc, name, index) => {
        const isLastKey = index === names.length - 1;
        if (isLastKey) acc[name] = userProperty.value;
        else acc[name] = acc[name] || {};
        return acc[name];
      }, mappedData.user);
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
  return oldest && oldest.uuid ? oldest.uuid : null;
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
    const eventName = eventData.event_name;

    const gaToEventName = {
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
        tracking_type: 'CUSTOM',
        custom_event_name: eventName
      };
    }

    return {
      tracking_type: gaToEventName[eventName]
    };
  }

  if (data.eventType === 'custom') {
    // Retrocompatibility v2 -> v3
    const retroCompatEventNameMapping = {
      Purchase: 'PURCHASE',
      SignUp: 'SIGN_UP'
    };
    if (retroCompatEventNameMapping[data.eventNameCustom]) {
      return {
        tracking_type: retroCompatEventNameMapping[data.eventNameCustom]
      };
    }

    return {
      tracking_type: 'CUSTOM',
      custom_event_name: data.eventNameCustom
    };
  }

  return {
    tracking_type: data.eventName
  };
}

/*==============================================================================
  Helpers
==============================================================================*/

function getUrl(eventData) {
  return eventData.page_location || eventData.page_referrer || getRequestHeader('referer');
}

function shouldExitEarly(data, eventData) {
  if (!isConsentGivenOrNotRequired(data, eventData)) {
    data.gtmOnSuccess();
    return true;
  }

  const url = getUrl(eventData);
  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
    data.gtmOnSuccess();
    return true;
  }
}

function getCookieAutoDomain() {
  return (
    computeEffectiveTldPlusOne(getEventData('page_location') || getRequestHeader('referer')) ||
    'auto'
  );
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '' && value === value;
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
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
