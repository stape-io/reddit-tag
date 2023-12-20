# Reddit Conversions API Tag for Google Tag Manager Server Container

The Reddit Conversion API Tag allows sending conversion data from server Google Tag Manager to Reddit servers.

### Reddit tag description:
**Event Name Setup Method** - select from a list of standard events, add a custom event, or choose to Inherit an event name from a client. When Inherit from client is selected, the Reddit CAPI tag will try to map events automatically into standard events or use a custom name if it’s impossible to map into a starred event.

**Reddit API Key** - create a Reddit account and find your API key by navigating to the Apps & API section of your account settings. This will show you all of the authorized apps and API keys associated with your account.

**Account ID** - Reddit account ID is the same as username.

**Test Mode** - indicates whether the conversion events should be processed.

**Use Optimistic Scenario** - The tag will call gtmOnSuccess() without waiting for a response from the API.

### Using tag, you can override:
- Reddit click ID
- Event time
- Conversion ID
- Currency
- Items count
- Products
- Value
- Value Decimal
- IP Adress
- Email
- External ID
- Idfa
- Aaid
- Opt-out
- User agent
- Screen dimensions

## Useful link:
- https://stape.io/blog/reddit-conversion-api-tag-for-server-google-tag-manager 
## Open Source

Reddit Tag for GTM Server Side is developing and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
