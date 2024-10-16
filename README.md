# Reddit Conversions API Tag for Google Tag Manager Server Container

The Reddit Conversion API Tag for server Google Tag Manager provides insights into Reddit marketing efforts, allowing strategies to be optimized accordingly.

## Reddit tag description
The Reddit Conversion API Tag allows conversion data to be sent from the Google Tag Manager to Reddit servers. With Tag, you can edit and send fields such as Common Event Data Override, Server Event Data Override, and User Data by specifying the parameters you want to exclude or override.

## Tag settings

![Reddit tag image](reddit_tag.png)

**Event Name Setup Method** - select from a list of standard events, add a custom event, or choose to Inherit an event name from a client. When Inherit from a client is selected, the Reddit CAPI tag will try to map events automatically into standard events or use a custom name if it’s impossible to map into a starred event.

**Account ID** - ID of the Reddit Ads account to which the conversion event belongs.

**Conversion Access Token** - a secure key that lets send conversion event data. 

**Test Mode** - indicates whether the conversion events should be processed.

**Use Optimistic Scenario** - the tag will trigger gtmOnSuccess() immediately without waiting for an API response. While this feature improves sGTM's response time, it also means that even if the tag fails to fire correctly, it will still report a success status.

### Override Server Event:
- Conversion ID
- Currency ID
- Item count
- Products
- Value
- Value Decimal

### Override User Data:
- IP address
- Email
- External ID 
- Idfa (Access identifier for advertisers) 
- Aaid (Android Advertising ID)
- Opt out
- User Agent 
- Screen Dimensions
- UUID (Universally Unique Identifier)

## Useful link
[How to set up the Reddit CAPI tag](https://stape.io/blog/reddit-conversion-api-tag-for-server-google-tag-manager#how-to-set-up-reddit-capi-tag)

## Open Source
Reddit Tag for GTM Server Side is developed and maintained by Stape Team under the Apache 2.0 license.