const kdbxweb = require('kdbxweb');
const Format = require('../util/format');
const Locale = require('../util/locale');
const MdToHtml = require('../util/md-to-html');
const Links = require('../const/links');
const RuntimeInfo = require('./runtime-info');

const Templates = {
    db: require('templates/export/db.hbs'),
    entry: require('templates/export/entry.hbs')
};

const FieldMapping = [
    { name: 'UserName', locStr: 'user' },
    { name: 'Password', locStr: 'password', protect: true },
    { name: 'URL', locStr: 'website' },
    { name: 'Notes', locStr: 'notes', markdown: true }
];

const KnownFields = { 'Title': true };
for (const { name } of FieldMapping) {
    KnownFields[name] = true;
}

function walkGroup(db, group, parents) {
    parents = [...parents, group];
    if (
        group.uuid.equals(db.meta.recycleBinUuid) ||
        group.uuid.equals(db.meta.entryTemplatesGroup)
    ) {
        return '';
    }
    const self = group.entries.map(entry => walkEntry(db, entry, parents)).join('\n');
    const children = group.groups.map(childGroup => walkGroup(db, childGroup, parents)).join('\n');
    return self + children;
}

function walkEntry(db, entry, parents) {
    const path = parents.map(group => group.name).join(' / ');
    const fields = [];
    for (const field of FieldMapping) {
        let value = entryField(entry, field.name);
        if (value) {
            let html = false;
            if (field.markdown) {
                const converted = MdToHtml.convert(value);
                if (converted !== value) {
                    value = converted;
                    html = true;
                }
            }
            fields.push({
                title: Format.capFirst(Locale[field.locStr]),
                value,
                protect: field.protect,
                html
            });
        }
    }
    for (const fieldName of Object.keys(entry.fields)) {
        if (!KnownFields[fieldName]) {
            const value = entryField(entry, fieldName);
            if (value) {
                fields.push({
                    title: fieldName,
                    value,
                    protect: entry.fields[fieldName].isProtected
                });
            }
        }
    }
    const title = entryField(entry, 'Title');
    let expires;
    if (entry.times.expires && entry.times.expiryTime) {
        expires = Format.dtStr(entry.times.expiryTime);
    }

    const attachments = Object.entries(entry.binaries)
        .map(([name, data]) => {
            if (data && data.ref) {
                data = data.value;
            }
            if (data) {
                const base64 = kdbxweb.ByteUtils.bytesToBase64(data);
                data = 'data:application/octet-stream;base64,' + base64;
            }
            return { name, data };
        })
        .filter(att => att.name && att.data);

    return Templates.entry({
        path,
        title,
        fields,
        tags: entry.tags.join(', '),
        created: Format.dtStr(entry.times.creationTime),
        modified: Format.dtStr(entry.times.lastModTime),
        expires,
        attachments
    });
}

function entryField(entry, fieldName) {
    const value = entry.fields[fieldName];
    return (value && value.isProtected && value.getText()) || value || '';
}

const KdbxToHtml = {
    convert(db, options) {
        const content = db.groups.map(group => walkGroup(db, group, [])).join('\n');
        return Templates.db({
            name: options.name,
            date: Format.dtStr(Date.now()),
            appLink: Links.Homepage,
            appVersion: RuntimeInfo.version,
            content
        });
    },

    entryToHtml(db, entry) {
        return walkEntry(db, entry, []);
    }
};

module.exports = KdbxToHtml;
