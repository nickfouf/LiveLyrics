const MAX_PACKET_SIZE = 1200;

class Framer {
    static frame(messageId, jsonData, timestamp) {
        const jsonString = JSON.stringify(jsonData);
        const buffer = Buffer.from(jsonString);
        const chunks = [];
        let sequenceNumber = 0;

        for (let i = 0; i < buffer.length; i += MAX_PACKET_SIZE) {
            const chunk = buffer.slice(i, i + MAX_PACKET_SIZE);
            chunks.push({
                messageId,
                sequenceNumber: sequenceNumber++,
                payload: chunk.toString('base64'),
                timestamp, // Include timestamp in each frame
            });
        }

        return chunks.map((chunk) => ({
            ...chunk,
            totalSequences: chunks.length,
        }));
    }

    static assemble(frames) {
        frames.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        const base64Payload = frames.map(frame => frame.payload).join('');
        const buffer = Buffer.from(base64Payload, 'base64');
        return JSON.parse(buffer.toString());
    }
}

module.exports = Framer;