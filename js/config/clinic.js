// Single source of truth for everything clinic-specific that ends up on a printed
// document. The invoice chrome (js/templates/invoiceChrome.js) and the document
// header (js/templates/docHeader.js) both render from this object, so the details
// can no longer drift apart between the invoice and the other documents.
//
// To change the address, phone, PAN etc. for the whole app, edit only this file.
const CLINIC = {
  // Full legal name, used on the blue banner of protocols/certificates.
  name: "EASYWALK PHYSIOTHERAPY AND REHABILITATION CENTRE",
  // Title-case form, used on continuation page headers.
  namePlain: "EasyWalk Physiotherapy and Rehabilitation Centre",
  // Short brand mark on the invoice header.
  brand: "EASYWALK",
  tagline: "Physiotherapy & Rehabilitation",

  addressLines: [
    "Plot No 15, Gr and 2nd Floor, Shivalik Stone, Pathardi Rd, Wasan Nagar,",
    "Pathardi Phata, Nashik, Maharashtra 422010"
  ],

  pan: "KFJPS7319J",
  udyam: "MH-23-0153661",
  phone: "+91 7972187511",
  email: "easywalkrehabnsk@gmail.com",
  web: "easywalkphysiorehab.com",
  instagram: "easywalk_physio_rehabilitation",

  // Printed above the signature line on the invoice.
  signatory: "For EasyWalk Physiotherapy Rehabilitation Centre"
};

// One-line form of the address, for places with limited vertical room.
const CLINIC_ADDRESS_ONE_LINE = CLINIC.addressLines.join(" ");
