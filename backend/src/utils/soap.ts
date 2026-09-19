import config from './config.js';

export const executeCommand = async(realmId: number, command: string, expect?: string | undefined) =>
{
    const soapCommand =
        `<?xml version="1.0" encoding="utf-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ns1="urn:AC">
  <SOAP-ENV:Body>
    <ns1:executeCommand>
      <command>${ command }</command>
    </ns1:executeCommand>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

    try
    {
        const response = await fetch(`http://${ config.SOAP_HOST[realmId] }:${ config.SOAP_PORT[realmId] }`, { body: soapCommand, method: 'POST', headers: { 'Content-Type': 'text/xml', Authorization: `Basic ${ Buffer.from(`${ config.SOAP_USERNAME[realmId] }:${ config.SOAP_PASSWORD[realmId] }`).toString('base64') }` } });

        if (response.ok)
        {
            const responseMessage = await response.text();

            return expect ? responseMessage.includes(expect) : responseMessage;
        }
    }
    catch (error)
    {
        console.log('Soap Error:', error);
    }

    return false;
};
